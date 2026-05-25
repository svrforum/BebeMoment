import { resolveAssetUrls } from '@/domain/url-resolver'
import { prisma } from '@/lib/prisma'
import { getAssetUrlsResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ familyId: z.string().uuid() })

export const assetsUrlsRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/assets/:id/urls', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { id } = paramsSchema.parse(req.params)
    const { familyId } = querySchema.parse(req.query)

    const asset = await prisma.asset.findFirst({
      where: { id, familyId, deletedAt: null },
    })
    if (!asset) {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: 'asset 을 찾을 수 없어요',
        retriable: false,
      })
    }

    const urls = await resolveAssetUrls(asset)
    const payload = getAssetUrlsResponse.parse({ v: 1, urls })
    reply.status(200).send(payload)
  })
}
