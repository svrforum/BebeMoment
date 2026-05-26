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
    })
  } catch (e) {
    console.error('[notifications] enqueue failed', (e as Error).message)
  }
}
