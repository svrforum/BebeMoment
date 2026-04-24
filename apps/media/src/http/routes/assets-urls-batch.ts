import { batchUrlsRequest, batchUrlsResponse } from '@bebe/media-client'
import type { AssetUrls } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { resolveAssetUrls } from '@/domain/url-resolver'
import { prisma } from '@/lib/prisma'
import { assertServiceToken } from '../middleware/service-token'

export const assetsUrlsBatchRoute: FastifyPluginAsync = async (app) => {
  app.post('/media/v1/assets/urls:batch', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { familyId, assetIds } = batchUrlsRequest.parse(req.body)

    if (assetIds.length === 0) {
      const empty = batchUrlsResponse.parse({ v: 1, urls: {} })
      reply.status(200).send(empty)
      return
    }

    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds }, familyId, deletedAt: null },
    })

    const urls: Record<string, AssetUrls> = {}
    for (const asset of assets) {
      urls[asset.id] = await resolveAssetUrls(asset)
    }

    const payload = batchUrlsResponse.parse({ v: 1, urls })
    reply.status(200).send(payload)
  })
}
