import { initAssetRequest, initAssetResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { initAsset } from '@/domain/upload/init'
import { prisma } from '@/lib/prisma'
import { assertServiceToken } from '../middleware/service-token'

export const assetsInitRoute: FastifyPluginAsync = async (app) => {
  app.post('/media/v1/assets/init', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const body = initAssetRequest.parse(req.body)

    const publicBaseUrl =
      process.env.MEDIA_PUBLIC_BASE_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:3001'
    const result = await initAsset(body, prisma, publicBaseUrl)

    const payload = initAssetResponse.parse({ v: 1, ...result })
    reply.status(201).send(payload)
  })
}
