export const ASSET_QUEUE = 'bebe-asset'

export type AssetEvent =
  | {
      type: 'asset.updated'
      familyId: string
      assetId: string
      status: 'processing' | 'ready' | 'failed'
      derivatives?: Record<string, string>
    }
  | { type: 'asset.deleted'; familyId: string; assetId: string }
  | { type: 'like.changed'; familyId: string; assetId: string; userId: string; liked: boolean }
  | { type: 'comment.added'; familyId: string; assetId: string; commentId: string }
  | { type: 'comment.updated'; familyId: string; assetId: string; commentId: string }
  | { type: 'comment.deleted'; familyId: string; assetId: string; commentId: string }

export function channelForFamily(familyId: string): string {
  return `bebe:events:family:${familyId}`
}
