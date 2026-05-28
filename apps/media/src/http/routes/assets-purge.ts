import { purgeAsset } from '@/domain/asset/purge'
import { prisma } from '@/lib/prisma'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

const paramsSchema = z.object({ id: z.string().uuid() })
const querySchema = z.object({ familyId: z.string().uuid() })

/**
 * POST /media/v1/assets/:id:purge — service-token gated permanent delete.
 *
 * The Google-style action verb is encoded as a literal `:purge` suffix on the
 * id segment. find-my-way needs the id param to be regex-constrained so the
 * fixed `:purge` tail isn't swallowed into the param value.
 */
export const assetsPurgeRoute: FastifyPluginAsync = async (app) => {
  app.post(`/media/v1/assets/:id(${UUID_RE}):purge`, async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { id } = paramsSchema.parse(req.params)
    const { familyId } = querySchema.parse(req.query)

    try {
      const result = await purgeAsset({ assetId: id, familyId }, prisma)
      reply.status(200).send({
        v: 1,
        assetId: result.assetId,
        deletedKeys: result.deletedKeys.length,
        failedKeys: result.failedKeys,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Distinguish "doesn't exist in this family" from "exists but not soft-deleted".
      if (message.includes('not in trash')) {
        throw new MediaHttpError({
          code: 'ASSET_NOT_DELETED',
          status: 400,
          message: '휴지통에 없는 자산은 영구 삭제할 수 없어요',
          retriable: false,
        })
      }
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: 'asset 을 찾을 수 없어요',
        retriable: false,
      })
    }
  })
}
