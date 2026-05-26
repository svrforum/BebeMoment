import { NOTIFICATIONS_QUEUE, type NotificationJob } from '@bebe/core'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

let queue: Queue | null = null
function getQueue(): Queue {
  if (!queue) {
    const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })
    queue = new Queue(NOTIFICATIONS_QUEUE, { connection })
  }
  return queue
}

export type EnqueueNotification = (job: NotificationJob) => Promise<void>

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  try {
    await getQueue().add(job.type, job, { removeOnComplete: true, removeOnFail: 100 })
  } catch (e) {
    console.error('[notifications] enqueue failed', (e as Error).message)
  }
}
