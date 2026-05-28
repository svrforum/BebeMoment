import { ASSET_QUEUE } from '@bebe/core'
import { type Job, Worker } from 'bullmq'
import { processAsset } from './jobs/process-asset'
import type { ProcessAssetJob } from './jobs/types'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { createRedisConnection } from './lib/redis'
import { getStorage } from './lib/storage'
import { createProgressPublisher } from './progress/publisher'

export async function startWorker(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const connection = createRedisConnection(redisUrl)
  const publisher = createRedisConnection(redisUrl)
  const progress = createProgressPublisher(publisher)
  const storage = getStorage()

  const worker = new Worker<ProcessAssetJob>(
    ASSET_QUEUE,
    async (job: Job<ProcessAssetJob>) => {
      if (job.data.type !== 'process-asset') {
        throw new Error(`Unknown job type: ${(job.data as { type: string }).type}`)
      }
      try {
        await processAsset({
          job: job.data,
          prisma,
          storage,
          publishProgress: (event) => progress.publish(event),
          logger,
        })
      } catch (err) {
        // process-asset marks the asset `failed` on every throw and bails on
        // re-entry when status !== 'processing'. If retries remain, flip the
        // status back to `processing` so the next attempt isn't pre-empted by
        // that guard. Only the FINAL attempt leaves the asset as `failed`.
        const attempts = job.opts.attempts ?? 1
        const attemptsMade = job.attemptsMade + 1
        if (attemptsMade < attempts) {
          await prisma.asset
            .updateMany({
              where: {
                id: job.data.assetId,
                familyId: job.data.familyId,
                status: 'failed',
              },
              data: { status: 'processing', processingError: null },
            })
            .catch((resetErr) => {
              logger.error(
                { id: job.id, error: (resetErr as Error).message },
                'failed to reset asset status for retry',
              )
            })
        }
        throw err
      }
    },
    {
      connection,
      concurrency: Number(process.env.MEDIA_CONCURRENCY_THUMBNAIL ?? 3),
    },
  )

  worker.on('completed', (job) => {
    logger.info({ id: job.id, ...job.data }, 'job completed')
  })
  worker.on('failed', (job, err) => {
    logger.error({ id: job?.id, error: err.message }, 'job failed')
  })

  const shutdown = async (): Promise<void> => {
    logger.info('worker shutting down')
    await worker.close()
    await connection.quit()
    await publisher.quit()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  logger.info('bebe-media worker consumer started')
}
