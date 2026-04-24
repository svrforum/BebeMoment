import { type FileServeTokenPayload, verifyFileServeToken } from '@/lib/jwt'
import { getStorage } from '@/lib/storage'
import { parseEnv } from '@bebe/config'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'

const FILE_SERVE_CACHE_SEC = 600

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
    reply.header('content-type', 'application/octet-stream')
    return reply.status(200).send(stream)
  })
}
