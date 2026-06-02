import { ASSET_QUEUE, FACES_QUEUE, type FaceDetectJob } from '@bebe/core'
import { parseEnv } from '@bebe/config'
import { type Job, Worker } from 'bullmq'
import { faceDetect } from './jobs/face-detect'
import { processAsset } from './jobs/process-asset'
import { reapStaleTusTmp } from './jobs/reap-stale-tus'
import { reapStaleUploads } from './jobs/reap-stale-uploads'
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
      const attempts = job.opts.attempts ?? 1
      try {
        await processAsset({
          job: job.data,
          prisma,
          storage,
          publishProgress: (event) => progress.publish(event),
          logger,
          isFinalAttempt: job.attemptsMade + 1 >= attempts,
        })
      } catch (err) {
        // process-asset marks the asset `failed` on every throw and bails on
        // re-entry when status !== 'processing'. If retries remain, flip the
        // status back to `processing` so the next attempt isn't pre-empted by
        // that guard. Only the FINAL attempt leaves the asset as `failed`.
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

  // 얼굴 인식(옵트인) — features.faces 켜졌을 때만 web 이 이 큐에 enqueue 한다. 꺼진
  // 인스턴스엔 잡이 없어 이 워커는 idle, ML 사이드카 호출도 없음.
  const facesWorker = new Worker<FaceDetectJob>(
    FACES_QUEUE,
    async (job: Job<FaceDetectJob>) => {
      if (job.data.type !== 'face-detect') return
      await faceDetect({
        familyId: job.data.familyId,
        assetId: job.data.assetId,
        prisma,
        storage,
        mlUrl: process.env.FACE_ML_URL ?? 'http://ml:8000',
        logger,
        ...(job.data.clusterDistance !== undefined
          ? { clusterDistance: job.data.clusterDistance }
          : {}),
      })
    },
    { connection, concurrency: Number(process.env.MEDIA_FACES_CONCURRENCY ?? 1) },
  )
  facesWorker.on('failed', (job, err) => {
    logger.error({ id: job?.id, error: err.message }, 'face-detect job failed')
  })

  worker.on('completed', (job) => {
    logger.info({ id: job.id, ...job.data }, 'job completed')
  })
  worker.on('failed', (job, err) => {
    logger.error({ id: job?.id, error: err.message }, 'job failed')
  })

  // 중단된 업로드 정리 — 부팅 직후 1회 + 매시간. (media 엔 BullMQ 반복잡 인프라가 없어
  // 경량 setInterval 로; reapStaleUploads 는 멱등하고 raw SQL 한 방이라 cheap.)
  const storagePath = parseEnv(process.env as Record<string, string | undefined>).STORAGE_PATH
  const reap = (): void => {
    void reapStaleUploads(prisma, logger).catch((e) =>
      logger.error({ err: (e as Error).message }, 'reapStaleUploads failed'),
    )
    void reapStaleTusTmp(storagePath)
      .then((n) => {
        if (n > 0) logger.warn({ count: n }, 'reaped stale tus-tmp files')
      })
      .catch((e) => logger.error({ err: (e as Error).message }, 'reapStaleTusTmp failed'))
  }
  const reapTimer = setInterval(reap, 60 * 60 * 1000)
  reap()

  const shutdown = async (): Promise<void> => {
    logger.info('worker shutting down')
    clearInterval(reapTimer)
    await worker.close()
    await facesWorker.close()
    await connection.quit()
    await publisher.quit()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  logger.info('bebe-media worker consumer started')
}
