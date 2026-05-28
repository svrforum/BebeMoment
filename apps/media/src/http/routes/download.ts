import { spawn } from 'node:child_process'
import { type DownloadTokenPayload, verifyDownloadToken } from '@/lib/jwt'
import { getStorage } from '@/lib/storage'
import { parseEnv } from '@bebe/config'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import sharp from 'sharp'
import { MediaHttpError } from '../middleware/error-handler'

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

// RFC 5987 filename* — 한글 파일명도 안전하게 attachment 로 내려준다.
function contentDisposition(filename: string): string {
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function setDownloadHeaders(reply: FastifyReply, payload: DownloadTokenPayload): void {
  reply.header('content-disposition', contentDisposition(payload.filename))
  reply.header('cache-control', 'private, max-age=0, must-revalidate')
}

async function serveOriginal(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
): Promise<FastifyReply> {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const storage = getStorage()
  if (env.STORAGE_MODE === 's3') {
    const url = await storage.publicUrl(payload.originalKey, { expiresIn: 600 })
    reply.redirect(url, 302)
    return reply
  }
  const exists = await storage.exists(payload.originalKey)
  if (!exists) {
    throw new MediaHttpError({
      code: 'ASSET_NOT_FOUND',
      status: 404,
      message: '파일을 찾을 수 없어요',
      retriable: false,
    })
  }
  const stream = await storage.read(payload.originalKey)
  reply.header('content-type', payload.mimeType || 'application/octet-stream')
  return reply.status(200).send(stream)
}

async function serveHdImageDerivative(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
  hdImageKey: string,
): Promise<FastifyReply> {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const storage = getStorage()
  if (env.STORAGE_MODE === 's3') {
    const url = await storage.publicUrl(hdImageKey, { expiresIn: 600 })
    reply.redirect(url, 302)
    return reply
  }
  const exists = await storage.exists(hdImageKey)
  if (!exists) return await serveLiveResizedImage(reply, payload)
  const stream = await storage.read(hdImageKey)
  reply.header('content-type', 'image/jpeg')
  return reply.status(200).send(stream)
}

async function serveLiveResizedImage(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
): Promise<FastifyReply> {
  const storage = getStorage()
  const exists = await storage.exists(payload.originalKey)
  if (!exists) {
    throw new MediaHttpError({
      code: 'ASSET_NOT_FOUND',
      status: 404,
      message: '파일을 찾을 수 없어요',
      retriable: false,
    })
  }
  const target = payload.quality === 'hd' ? 1080 : 720
  const input = await storage.read(payload.originalKey)
  const buf = await streamToBuffer(input)
  const out = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ height: target, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  reply.header('content-type', 'image/jpeg')
  reply.header('content-length', String(out.length))
  return reply.status(200).send(out)
}

async function serveLiveTranscodedVideo(
  reply: FastifyReply,
  payload: DownloadTokenPayload,
): Promise<FastifyReply> {
  const storage = getStorage()
  const exists = await storage.exists(payload.originalKey)
  if (!exists) {
    throw new MediaHttpError({
      code: 'ASSET_NOT_FOUND',
      status: 404,
      message: '파일을 찾을 수 없어요',
      retriable: false,
    })
  }
  const height = payload.quality === 'hd' ? 1080 : 720
  // libx264 는 짝수 width 가 필요 — trunc(oh*a/2)*2.
  // fragmented MP4 — content-length 알 수 없음 → 스트리밍.
  const ffArgs = [
    '-i',
    '-',
    '-vf',
    `scale=trunc(oh*a/2)*2:${height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '24',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+frag_keyframe+empty_moov',
    '-f',
    'mp4',
    'pipe:1',
  ]
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  const stderrChunks: Buffer[] = []
  ff.stderr.on('data', (c: Buffer) => {
    // 진단용 — 평소엔 버린다. 종료 코드 비정상이면 로그로 흘려보낼 수 있게 보관.
    if (stderrChunks.length < 64) stderrChunks.push(c)
  })

  const input = await storage.read(payload.originalKey)
  input.on('error', () => {
    ff.kill('SIGKILL')
  })
  input.pipe(ff.stdin)
  ff.stdin.on('error', () => {
    // EPIPE — ffmpeg 가 먼저 종료된 경우. 입력을 끊고 마무리.
    try {
      ;(input as unknown as { destroy?: () => void }).destroy?.()
    } catch {
      // 정리 실패는 무시.
    }
  })

  // 응답이 끊기면 ffmpeg 도 종료.
  reply.raw.on('close', () => {
    if (!ff.killed) ff.kill('SIGKILL')
  })

  // 비정상 종료 처리 — 헤더 전 송출이면 500, 송출 후엔 raw 종료.
  let hadError = false
  ff.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      hadError = true
      const tail = Buffer.concat(stderrChunks).toString('utf8').slice(-2000)
      reply.log.warn({ code, stderr: tail }, 'ffmpeg transcode failed')
    }
  })

  reply.header('content-type', 'video/mp4')
  // 응답 시작 — stdout 스트림을 그대로 흘려보낸다.
  reply.status(200).send(ff.stdout)

  // 동기적으로 reply 를 반환해 fastify 가 send 를 마무리하게 둔다.
  // hadError 는 위 'exit' 콜백에서 로깅용으로만 쓰임 — 응답 헤더는 이미 나갔다.
  void hadError
  return reply
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

    setDownloadHeaders(reply, payload)

    if (payload.quality === 'original') {
      return await serveOriginal(reply, payload)
    }

    if (payload.kind === 'image') {
      if (payload.quality === 'hd' && payload.hdImageKey) {
        return await serveHdImageDerivative(reply, payload, payload.hdImageKey)
      }
      return await serveLiveResizedImage(reply, payload)
    }

    // video, hd | sd
    return await serveLiveTranscodedVideo(reply, payload)
  })
}
