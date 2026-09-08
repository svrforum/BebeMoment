import { keyBelongsToAsset } from '@/domain/asset-key'
import { getEnv } from '@/lib/env'
import { type DownloadTokenPayload, verifyDownloadToken } from '@/lib/jwt'
import { Semaphore } from '@/lib/semaphore'
import { decodeSharp } from '@/lib/sharp'
import { getStorage } from '@/lib/storage'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'

// 요청 시점 재인코드(갤러리용 JPEG)는 동시에 2개까지. 넘치면 503 retriable — 워커의
// 파생물 생성과 CPU 를 다투다 NAS 전체가 느려지는 걸 막는다.
// export 는 테스트 seam 이다: 슬롯을 직접 잡아야 거절 경로를 결정적으로 확인할 수 있다
// (실제 재인코드 3개를 경주시키면 부하가 높은 기계에서 타임아웃으로 깨진다).
export const LIVE_SLOTS = new Semaphore(2)

function busy(): MediaHttpError {
  return new MediaHttpError({
    code: 'RATE_LIMITED',
    status: 503,
    message: '지금 변환 중인 파일이 많아요. 잠시 후 다시 시도해 주세요',
    retriable: true,
  })
}

function withLiveSlot<T>(fn: () => Promise<T>): Promise<T> {
  const running = LIVE_SLOTS.tryRun(fn)
  if (!running) throw busy()
  return running
}

function notFound(): MediaHttpError {
  return new MediaHttpError({
    code: 'ASSET_NOT_FOUND',
    status: 404,
    message: '파일을 찾을 수 없어요',
    retriable: false,
  })
}

async function streamToBuffer(s: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of s) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
    } else if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(Buffer.from(chunk as Uint8Array))
    }
  }
  return Buffer.concat(chunks)
}

// RFC 6266: 플레인 filename="…"(ASCII 폴백) + filename*=UTF-8''(한글 정확). 안드로이드
// URLUtil.guessFileName 은 filename* 를 못 읽고 filename= 만 보므로 둘 다 넣어야 원본
// 파일명으로 저장된다(없으면 'download' 같은 일반 이름이 됨).
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download'
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

// 갤러리용 JPEG: EXIF(촬영일 포함)를 떨어뜨리면 휴대폰 갤러리가 파일 시각(=저장 시점)
// 기준으로 맨 위에 보여준다. sharp 는 기본적으로 metadata 를 보존하지 않으므로 재인코딩하며
// EXIF 를 떨어뜨리고, `.rotate()` 가 EXIF Orientation 을 픽셀에 구워(회전 손실 방지)
// Orientation 태그 없이도 바로 선다. (무손실 마커-스트립은 Orientation 까지 같이 날려 ≠1
// 사진이 돌아가 보이는 문제가 있어 sharp 재인코딩으로 교체.) 기본 저장(auto)이 이 경로다;
// 사용자가 '원본'을 고르면 재인코딩 없이 저장된 바이트 그대로 준다.
async function stripJpegMetadata(buf: Buffer): Promise<Buffer> {
  return decodeSharp(buf).rotate().jpeg({ quality: 95, mozjpeg: true }).toBuffer()
}

function setDownloadHeaders(reply: FastifyReply, payload: DownloadTokenPayload): void {
  reply.header('content-disposition', contentDisposition(payload.filename))
  reply.header('cache-control', 'private, max-age=0, must-revalidate')
  // 저장된 mimeType 을 그대로 내려주는 경로(원본)도 있으므로 스니핑 차단(동일 오리진).
  reply.header('x-content-type-options', 'nosniff')
}

async function redirectIfS3(reply: FastifyReply, key: string): Promise<boolean> {
  if (getEnv().STORAGE_MODE !== 's3') return false
  const url = await getStorage().publicUrl(key, { expiresIn: 600 })
  reply.redirect(url, 302)
  return true
}

// 원본은 원본 — 저장된 바이트를 실제 content-type 으로 그대로 스트리밍한다(재인코딩·EXIF
// 제거·버퍼링 없음).
async function serveOriginal(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
): Promise<FastifyReply> {
  if (await redirectIfS3(reply, payload.originalKey)) return reply
  const storage = getStorage()
  const st = await storage.stat(payload.originalKey)
  if (!st) throw notFound()
  reply.header('content-type', payload.mimeType || 'application/octet-stream')
  reply.header('content-length', String(st.size))
  return reply.status(200).send(await storage.read(payload.originalKey))
}

async function serveGalleryJpeg(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
): Promise<FastifyReply> {
  if (await redirectIfS3(reply, payload.originalKey)) return reply
  const storage = getStorage()
  if (!(await storage.exists(payload.originalKey))) throw notFound()
  const buf = await streamToBuffer(await storage.read(payload.originalKey))
  const out = await withLiveSlot(() => stripJpegMetadata(buf))
  reply.header('content-type', 'image/jpeg')
  reply.header('content-length', String(out.length))
  return reply.status(200).send(out)
}

async function serveVideoCompat(
  reply: FastifyReply,
  videoCompatKey: string,
): Promise<FastifyReply> {
  if (await redirectIfS3(reply, videoCompatKey)) return reply
  const storage = getStorage()
  // 파생물이 사라졌으면(정리·부분 복구) 404 로 알린다 — 예전엔 요청마다 ffmpeg 를 띄워
  // 실시간 변환했지만, 그 비용은 저장 한 번의 값어치가 없고 원인(사라진 파생물)도 가렸다.
  const st = await storage.stat(videoCompatKey)
  if (!st) throw notFound()
  const stream = await storage.read(videoCompatKey)
  reply.header('content-type', 'video/mp4')
  reply.header('content-length', String(st.size))
  return reply.status(200).send(stream)
}

// 살아있는 품질은 original / gallery / compat 뿐이다. 제거된 압축 다운로드(hd·sd)로 이미
// 발급된 토큰(TTL 10분)이 배포 직후 저장을 실패시키지 않도록 살아있는 품질로 접는다 —
// 사진은 갤러리용 JPEG(토큰이 이미 .jpg·image/jpeg 로 발급돼 있어 일치), 영상은 원본.
function effectiveQuality(payload: DownloadTokenPayload): DownloadTokenPayload['quality'] {
  const quality: string = payload.quality
  if (quality === 'gallery') return 'gallery'
  if (quality === 'compat') return payload.videoCompatKey ? 'compat' : 'original'
  if (quality === 'original') return 'original'
  return payload.kind === 'image' ? 'gallery' : 'original'
}

export const downloadRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/download/:signed', async (req, reply) => {
    const { signed } = req.params as { signed: string }

    let payload: DownloadTokenPayload
    try {
      payload = await verifyDownloadToken(signed)
    } catch {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않거나 만료된 URL 이에요',
        retriable: false,
      })
    }

    // 토큰의 familyId/assetId 와 서빙할 key 들을 결속(IDOR 방어 — files.ts 와 동일).
    // 원본은 families/ 접두, 파생물(호환 영상)은 derivatives/ 접두라 둘 다 허용해야 한다.
    if (
      !keyBelongsToAsset(payload.originalKey, payload.familyId, payload.assetId) ||
      (payload.videoCompatKey !== undefined &&
        !keyBelongsToAsset(payload.videoCompatKey, payload.familyId, payload.assetId))
    ) {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않은 URL 이에요',
        retriable: false,
      })
    }

    setDownloadHeaders(reply, payload)

    const quality = effectiveQuality(payload)
    if (quality === 'gallery') return await serveGalleryJpeg(reply, payload)
    if (quality === 'compat' && payload.videoCompatKey) {
      return await serveVideoCompat(reply, payload.videoCompatKey)
    }
    return await serveOriginal(reply, payload)
  })
}
