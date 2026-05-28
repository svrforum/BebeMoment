import { resolveAssetUrls } from '@/domain/url-resolver'
import { prisma } from '@/lib/prisma'
import { batchUrlsRequest, batchUrlsResponse } from '@bebe/media-client'
import type { AssetUrls } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { assertServiceToken } from '../middleware/service-token'

export const assetsUrlsBatchRoute: FastifyPluginAsync = async (app) => {
  app.post('/media/v1/assets/urls:batch', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { familyId, assetIds, includeDeleted } = batchUrlsRequest.parse(req.body)

    if (assetIds.length === 0) {
      const empty = batchUrlsResponse.parse({ v: 1, urls: {} })
      reply.status(200).send(empty)
      return
    }

    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds }, familyId, ...(includeDeleted ? {} : { deletedAt: null }) },
    })

    // Resolve every asset's URLs in parallel — the inner resolveAssetUrls
    // is itself parallel, so a 100-asset batch goes from ~100×N×roundtrip
    // sequential JWT signs to one wall-time burst.
    const resolved = await Promise.all(
      assets.map(async (asset) => [asset.id, await resolveAssetUrls(asset)] as const),
    )
    const urls: Record<string, AssetUrls> = Object.fromEntries(resolved)

    const payload = batchUrlsResponse.parse({ v: 1, urls })
    reply.status(200).send(payload)
  })
}
