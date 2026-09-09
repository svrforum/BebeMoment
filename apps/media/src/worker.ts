import { ASSET_QUEUE, FACES_QUEUE, type FaceDetectJob } from '@bebe/core'
import { type Job, Worker } from 'bullmq'
import { faceDetect } from './jobs/face-detect'
import { processAsset } from './jobs/process-asset'
import { reapStaleTusTmp } from './jobs/reap-stale-tus'
import { reapStaleUploads, reapStuckProcessing } from './jobs/reap-stale-uploads'
import type { ProcessAssetJob } from './jobs/types'
import { getEnv } from './lib/env'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { createRedisConnection } from './lib/redis'
import { getStorage } from './lib/storage'
import { createProgressPublisher } from './progress/publisher'

export async function startWorker(): Promise<() => Promise<void>> {
  const env = getEnv()
  const connection = createRedisConnection(env.REDIS_URL)
  const publisher = createRedisConnection(env.REDIS_URL)
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
      concurrency: env.MEDIA_CONCURRENCY_THUMBNAIL,
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
        mlUrl: env.FACE_ML_URL,
        logger,
        ...(job.data.clusterDistance !== undefined
          ? { clusterDistance: job.data.clusterDistance }
          : {}),
      })
    },
    { connection, concurrency: env.MEDIA_FACES_CONCURRENCY },
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

  // 중단된 업로드 정리 — 부팅 직후 1회 + 10분마다. (media 엔 BullMQ 반복잡 인프라가 없어
  // 경량 setInterval 로; reapStaleUploads 는 멱등하고 raw SQL 한 방이라 cheap.)
  const storagePath = env.STORAGE_PATH
  // 중단된 업로드를 failed 로 마킹하는 기준 시간(시간). 기본 0.5h — tus PATCH 하트비트가
  // 진행 중인 업로드의 updated_at 을 계속 밀어 주므로(§progress.ts) 짧아도 살아 있는
  // 업로드를 죽이지 않는다. 대신 죽은 업로드가 몇 시간씩 정상 사진 행세를 하지 못한다.
  const staleMs = env.MEDIA_STALE_UPLOAD_HOURS * 60 * 60 * 1000
  // 처리 중 갇힌 것도 같이 본다 — 기준은 더 길게(큰 영상 트랜스코딩이 정상적으로 오래 걸린다).
  const processingStaleMs = env.MEDIA_STALE_PROCESSING_HOURS * 60 * 60 * 1000
  const reap = (): void => {
    void reapStaleUploads(prisma, logger, staleMs).catch((e) =>
      logger.error({ err: (e as Error).message }, 'reapStaleUploads failed'),
    )
    void reapStuckProcessing(prisma, logger, processingStaleMs).catch((e) =>
      logger.error({ err: (e as Error).message }, 'reapStuckProcessing failed'),
    )
    void reapStaleTusTmp(storagePath, staleMs)
      .then((n) => {
        if (n > 0) logger.warn({ count: n }, 'reaped stale tus-tmp files')
      })
      .catch((e) => logger.error({ err: (e as Error).message }, 'reapStaleTusTmp failed'))
  }
  const reapTimer = setInterval(reap, 10 * 60 * 1000)
  reap()

  logger.info('bebe-media worker consumer started')

  // 종료는 main.ts 가 단일 핸들러로 조율한다(서버·워커 동시 graceful close). 여기서
  // 직접 SIGTERM 을 잡으면 main 의 즉시 exit 과 경쟁해 진행 중 잡이 잘렸다.
  return async () => {
    logger.info('worker shutting down')
    clearInterval(reapTimer)
    await worker.close()
    await facesWorker.close()
    await connection.quit()
    await publisher.quit()
  }
}
