export function progressChannel(assetId: string): string {
  return `progress:${assetId}`
}

export type ProgressEvent =
  | { type: 'progress'; assetId: string; uploadedBytes: number; totalBytes: number }
  | {
      type: 'status'
      assetId: string
      status: 'processing' | 'ready' | 'failed'
      familyId?: string
      derivatives?: Record<string, string>
      reason?: string
    }
