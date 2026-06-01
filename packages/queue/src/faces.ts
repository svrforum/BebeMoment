import { FACES_QUEUE, type FaceDetectJob } from '@bebe/core'
import { Queue } from 'bullmq'
import { createRedisConnection } from './redis'

let queue: Queue | null = null

function getFacesQueue(): Queue {
  if (!queue) {
    queue = new Queue(FACES_QUEUE, { connection: createRedisConnection() })
  }
  return queue
}

/** 얼굴 인식 잡 enqueue — features.faces 켜졌을 때만 호출(web 게이팅). */
export async function enqueueFaceDetect(job: FaceDetectJob): Promise<void> {
  try {
    await getFacesQueue().add(job.type, job, {
      removeOnComplete: true,
      removeOnFail: 100,
      // ML 사이드카 일시 장애로 잡이 조용히 유실되지 않게 재시도(process-asset 과 동형).
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    })
  } catch (e) {
    console.error('[faces] enqueue failed', (e as Error).message)
  }
}
