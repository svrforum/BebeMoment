export const ASSET_QUEUE = 'bebe-asset'

// 얼굴 인식(옵트인) 잡 큐 — web 이 features.faces 켜진 자산에만 enqueue, 미디어 워커가
// ML 사이드카를 호출해 처리. faces 꺼진 인스턴스엔 잡이 없음.
export const FACES_QUEUE = 'bebe-faces'

export type FaceDetectJob = {
  type: 'face-detect'
  familyId: string
  assetId: string
}

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
