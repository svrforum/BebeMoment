import { updateAssetMetadata } from '@/domain/asset/update-metadata'
import { prisma } from '@/lib/prisma'
import { updateAssetMetadataRequest, updateAssetMetadataResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { assertServiceToken } from '../middleware/service-token'

export const assetsUpdateRoute: FastifyPluginAsync = async (app) => {
  app.patch<{ Params: { id: string } }>('/media/v1/assets/:id', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const body = updateAssetMetadataRequest.parse(req.body)
    const result = await updateAssetMetadata({ assetId: req.params.id, input: body }, prisma)
    const payload = updateAssetMetadataResponse.parse({
      v: 1,
      filename: result.filename,
      caption: result.caption,
      takenAt: result.takenAt.toISOString(),
      takenAtSource: result.takenAtSource,
    })
    reply.send(payload)
  })
}
