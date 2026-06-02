import { prisma } from '@/lib/prisma'
import { createRedisConnection } from '@/lib/redis'
import { parseEnv } from '@bebe/config'
import { ASSET_QUEUE } from '@bebe/core'
import { Queue } from 'bullmq'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ familyId: z.string().uuid() })

/**
 * POST /media/v1/assets/:id/retry — service-token gated. 처리에 실패한 자산을 다시
 * 처리 큐에 넣는다(status failed → processing 후 재enqueue). 원본 바이트는 보존돼
 * 있으므로 파생물·메타를 다시 생성한다. 변환(HEIC→JPEG)은 재시도에선 적용하지 않는다.
 */
export const assetsRetryRoute: FastifyPluginAsync = async (app) => {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const queue = new Queue(ASSET_QUEUE, { connection: createRedisConnection(env.REDIS_URL) })

  app.post(`/media/v1/assets/:id(${UUID_RE})/retry`, async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { id } = paramsSchema.parse(req.params)
    const { familyId } = bodySchema.parse(req.body)

    const asset = await prisma.asset.findFirst({
      where: { id, familyId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (!asset) {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: 'asset 을 찾을 수 없어요',
        retriable: false,
      })
    }
    if (asset.status !== 'failed') {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FAILED',
        status: 400,
        message: '실패한 자산만 다시 시도할 수 있어요',
        retriable: false,
      })
    }

    // 재처리 전 processing 으로 — processAsset 은 status !== 'processing' 이면 바일아웃.
    await prisma.asset.update({
      where: { id, familyId },
      data: { status: 'processing', processingError: null },
    })
    await queue.add(
      'process-asset',
      { type: 'process-asset', familyId, assetId: id, convertToCompatible: false },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    )
    reply.status(200).send({ v: 1, assetId: id, status: 'processing' })
  })
}
