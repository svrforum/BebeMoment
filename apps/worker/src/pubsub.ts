import { channelForFamily, type AssetEvent } from '@bebe/core'
import type IORedis from 'ioredis'

export type { AssetEvent }
export { channelForFamily }

export async function publishAssetEvent(redis: IORedis, event: AssetEvent): Promise<void> {
  await redis.publish(channelForFamily(event.familyId), JSON.stringify(event))
}
