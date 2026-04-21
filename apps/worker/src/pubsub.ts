import type IORedis from 'ioredis'

export type AssetEvent = {
  type: 'asset.updated'
  familyId: string
  assetId: string
  status: 'processing' | 'ready' | 'failed'
  derivatives?: Record<string, string>
}

export function channelForFamily(familyId: string): string {
  return `bebe:events:family:${familyId}`
}

export async function publishAssetEvent(redis: IORedis, event: AssetEvent): Promise<void> {
  await redis.publish(channelForFamily(event.familyId), JSON.stringify(event))
}
