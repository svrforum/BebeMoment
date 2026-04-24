import { parseEnv } from '@bebe/config'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { streamProgress } from '@/progress/sse'
import { MediaHttpError } from '../middleware/error-handler'
import { extractUploadToken } from '../middleware/upload-token'

const querySchema = z.object({ assetId: z.string().uuid() })

export const sseProgressRoute: FastifyPluginAsync = async (app) => {
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
    const env = parseEnv(process.env as Record<string, string | undefined>)
    await streamProgress({ reply, assetId, redisUrl: env.REDIS_URL })
  })
}
