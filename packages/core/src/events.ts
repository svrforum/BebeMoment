export const ASSET_QUEUE = 'bebe-asset'

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
