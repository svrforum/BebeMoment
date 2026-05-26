import { NOTIFICATIONS_QUEUE, type NotificationJob } from '@bebe/core'
import { Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { createRedisConnection } from '../lib/redis'

let queue: Queue | null = null
function getQueue(): Queue {
  if (!queue) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
    queue = new Queue(NOTIFICATIONS_QUEUE, { connection: createRedisConnection(url) })
  }
  return queue
}

export type EnqueueNotification = (job: NotificationJob) => Promise<void>

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  try {
    await getQueue().add(job.type, job, { removeOnComplete: true, removeOnFail: 100 })
  } catch (e) {
    logger.error({ error: (e as Error).message }, '[notifications] enqueue failed')
  }
}
