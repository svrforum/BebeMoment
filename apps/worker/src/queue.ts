import { ASSET_QUEUE } from '@bebe/core'
import { Queue, QueueEvents } from 'bullmq'
import type IORedis from 'ioredis'

export { ASSET_QUEUE }

export function createAssetQueue(connection: IORedis): Queue {
  return new Queue(ASSET_QUEUE, { connection })
}

export function createAssetQueueEvents(connection: IORedis): QueueEvents {
  return new QueueEvents(ASSET_QUEUE, { connection })
}
