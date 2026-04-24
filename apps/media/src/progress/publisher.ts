import { channelForFamily } from '@bebe/core'
import type IORedis from 'ioredis'
import { type ProgressEvent, progressChannel } from './channel'

export function createProgressPublisher(redis: IORedis) {
  return {
    async publish(event: ProgressEvent): Promise<void> {
      if (event.type === 'status' && event.familyId) {
        const familyPayload = {
          type: 'asset.updated' as const,
          familyId: event.familyId,
          assetId: event.assetId,
          status: event.status,
          ...(event.derivatives !== undefined ? { derivatives: event.derivatives } : {}),
        }
        await redis.publish(channelForFamily(event.familyId), JSON.stringify(familyPayload))
      }
      await redis.publish(progressChannel(event.assetId), JSON.stringify(event))
    },
  }
}

export type ProgressPublisher = ReturnType<typeof createProgressPublisher>
