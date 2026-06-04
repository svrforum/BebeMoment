import { keyBelongsToAsset } from '@/domain/asset-key'
import { type FileServeTokenPayload, verifyFileServeToken } from '@/lib/jwt'
import { getStorage } from '@/lib/storage'
import { parseEnv } from '@bebe/config'
import type { FastifyPluginAsync } from 'fastify'
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

export const filesRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/files/:signed', async (req, reply) => {
    const { signed } = req.params as { signed: string }

    let payload: FileServeTokenPayload
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

    const env = parseEnv(process.env as Record<string, string | undefined>)
    const storage = getStorage()

    if (env.STORAGE_MODE === 's3') {
      const url = await storage.publicUrl(payload.key, { expiresIn: FILE_SERVE_CACHE_SEC })
      reply.redirect(url, 302)
      return reply
    }

    const exists = await storage.exists(payload.key)
    if (!exists) {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: '파일을 찾을 수 없어요',
        retriable: false,
      })
    }

    const stream = await storage.read(payload.key)
    reply.header('cache-control', `private, max-age=${FILE_SERVE_CACHE_SEC}`)
    reply.header('content-type', contentTypeForKey(payload.key))
    // 미디어는 /media/* rewrite 로 앱과 동일 오리진에서 서빙된다. nosniff 없이는 업로드된
    // 파일을 브라우저가 text/html 로 스니핑해 앱 오리진에서 실행할 수 있어(저장형 XSS),
    // 반드시 스니핑 차단 + inline(네비게이션 가능한 HTML 문서가 되지 않게).
    reply.header('x-content-type-options', 'nosniff')
    reply.header('content-disposition', 'inline')
    return reply.status(200).send(stream)
  })
}
