import { getEnv } from '@/lib/env'
import { streamProgress } from '@/progress/sse'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { MediaHttpError } from '../middleware/error-handler'
import { extractUploadToken } from '../middleware/upload-token'

const querySchema = z.object({ assetId: z.string().uuid() })

export const sseProgressRoute: FastifyPluginAsync = async (app) => {
  const redisUrl = getEnv().REDIS_URL
  app.get('/media/v1/progress/sse', async (req, reply) => {
    const { assetId } = querySchema.parse(req.query)
    const token = await extractUploadToken(req)
    if (token.assetId !== assetId) {
      throw new MediaHttpError({
        code: 'FAMILY_MISMATCH',
        status: 403,
        message: '다른 asset 입니다',
        retriable: false,
      })
    }
    reply.hijack()
    await streamProgress({ request: req, reply, assetId, redisUrl })
  })
}
