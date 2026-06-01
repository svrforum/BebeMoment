import { NOTIFICATIONS_QUEUE, type NotificationJob } from '@bebe/core'
import { Queue } from 'bullmq'
import { createRedisConnection } from './redis'

let queue: Queue | null = null

export function getNotificationQueue(): Queue {
  if (!queue) {
    queue = new Queue(NOTIFICATIONS_QUEUE, { connection: createRedisConnection() })
  }
  return queue
}

export type EnqueueNotification = (job: NotificationJob) => Promise<void>

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  try {
    await getNotificationQueue().add(job.type, job, {
      removeOnComplete: true,
      removeOnFail: 100,
      // 일시적 실패(DB 깜빡임·FCM 토큰발급 실패 등)에 푸시가 통째로 사라지지 않도록 재시도.
      // 발송은 죽은 구독 정리·멱등에 가까워 중복 푸시 위험은 낮다(조용한 실패 금지).
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })
  } catch (e) {
    console.error('[notifications] enqueue failed', (e as Error).message)
  }
}
