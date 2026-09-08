import { createHash } from 'node:crypto'
import { keyBelongsToAsset } from '@/domain/asset-key'
import { getEnv } from '@/lib/env'
import { type VerifiedFileServeToken, verifyFileServeToken } from '@/lib/jwt'
import { getStorage } from '@/lib/storage'
import type { StorageStat } from '@bebe/storage'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'

const FILE_SERVE_CACHE_SEC = 600

// key 확장자로 안전한 image/video mime 을 준다. nosniff 와 함께 쓰면 보안(HTML 스니핑→
// 저장형 XSS 차단)은 유지하면서, 크롤러(카톡 OG)·브라우저가 이미지로 정확히 인식한다.
// 알 수 없는 확장자는 octet-stream(기존 안전 기본값).
function contentTypeForKey(key: string): string {
  const ext = key.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

// 키는 자산마다 고유하고 파생물은 다시 쓰이지 않으므로 키+크기(+mtime)면 강한 검증자로 충분.
function etagFor(key: string, st: StorageStat): string {
  const h = createHash('sha1')
    .update(`${key}\0${st.size}\0${st.mtimeMs ?? ''}`)
    .digest('hex')
  return `"${h.slice(0, 32)}"`
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false
  return header.split(',').some((t) => t.trim() === etag || t.trim() === '*')
}

// 파생물은 키가 곧 내용이라 토큰이 살아 있는 동안 immutable — 브라우저가 재검증조차
// 안 한다. 원본은 변환(HEIC→JPEG)으로 같은 키에 다른 바이트가 올 수 있어 짧게 둔다.
function cacheControlFor(payload: VerifiedFileServeToken): string {
  if (!payload.key.startsWith('derivatives/')) return `private, max-age=${FILE_SERVE_CACHE_SEC}`
  const remaining = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
  return `private, max-age=${remaining}, immutable`
}

type ByteRange = { start: number; end: number } | 'unsatisfiable' | null

// 단일 범위만 받는다(bytes=a-b / a- / -suffix). 다중·다른 단위·형식 오류는 무시하고 전체를
// 준다 — RFC 9110 이 허용하는 처리이고, 브라우저 미디어 요소는 단일 범위만 보낸다.
function parseRange(header: string | undefined, size: number): ByteRange {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0 || size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(m[1])
  if (start >= size) return 'unsatisfiable'
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  if (end < start) return 'unsatisfiable'
  return { start, end }
}

function setCommonHeaders(
  reply: FastifyReply,
  payload: VerifiedFileServeToken,
  etag: string,
): void {
  reply.header('cache-control', cacheControlFor(payload))
  reply.header('etag', etag)
  reply.header('accept-ranges', 'bytes')
  reply.header('content-type', contentTypeForKey(payload.key))
  // 미디어는 /media/* rewrite 로 앱과 동일 오리진에서 서빙된다. nosniff 없이는 업로드된
  // 파일을 브라우저가 text/html 로 스니핑해 앱 오리진에서 실행할 수 있어(저장형 XSS),
  // 반드시 스니핑 차단 + inline(네비게이션 가능한 HTML 문서가 되지 않게).
  reply.header('x-content-type-options', 'nosniff')
  reply.header('content-disposition', 'inline')
}

export const filesRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/files/:signed', async (req, reply) => {
    const { signed } = req.params as { signed: string }

    let payload: VerifiedFileServeToken
    try {
      payload = await verifyFileServeToken(signed)
    } catch {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않거나 만료된 URL 이에요',
        retriable: false,
      })
    }

    // 토큰의 familyId/assetId 와 서빙할 key 를 결속(IDOR 방어). 원본은 families/ 접두,
    // 파생물은 derivatives/<asset>/ 접두 — 둘 다 허용(keyBelongsToAsset).
    if (!keyBelongsToAsset(payload.key, payload.familyId, payload.assetId)) {
      throw new MediaHttpError({
        code: 'UNAUTHORIZED',
        status: 401,
        message: '유효하지 않은 URL 이에요',
        retriable: false,
      })
    }

    const env = getEnv()
    const storage = getStorage()

    if (env.STORAGE_MODE === 's3') {
      const url = await storage.publicUrl(payload.key, { expiresIn: FILE_SERVE_CACHE_SEC })
      reply.redirect(url, 302)
      return reply
    }

    const st = await storage.stat(payload.key)
    if (!st) {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: '파일을 찾을 수 없어요',
        retriable: false,
      })
    }

    const etag = etagFor(payload.key, st)
    setCommonHeaders(reply, payload, etag)

    if (etagMatches(req.headers['if-none-match'], etag)) {
      return reply.status(304).send()
    }

    const range = parseRange(req.headers.range, st.size)
    if (range === 'unsatisfiable') {
      reply.header('content-range', `bytes */${st.size}`)
      return reply.status(416).send()
    }
    if (range) {
      reply.header('content-range', `bytes ${range.start}-${range.end}/${st.size}`)
      reply.header('content-length', String(range.end - range.start + 1))
      return reply.status(206).send(await storage.readRange(payload.key, range.start, range.end))
    }

    reply.header('content-length', String(st.size))
    return reply.status(200).send(await storage.read(payload.key))
  })
}
