export const ASSET_QUEUE = 'bebe-asset'

// 얼굴 인식(옵트인) 잡 큐 — web 이 features.faces 켜진 자산에만 enqueue, 미디어 워커가
// ML 사이드카를 호출해 처리. faces 꺼진 인스턴스엔 잡이 없음.
export const FACES_QUEUE = 'bebe-faces'

// 같은 사람으로 묶는 코사인 거리 임계 기본값(작을수록 엄격). 관리자가
// `faces.cluster_distance` 설정으로 조절 → web 이 잡 페이로드에 실어 보낸다(media 는
// public 설정 못 읽음). 안전 범위는 0.1~0.9.
export const DEFAULT_FACE_CLUSTER_DISTANCE = 0.45
export const FACE_CLUSTER_DISTANCE_MIN = 0.1
export const FACE_CLUSTER_DISTANCE_MAX = 0.9

export type FaceDetectJob = {
  type: 'face-detect'
  familyId: string
  assetId: string
  /** 코사인 군집 거리 임계(관리자 설정). 없으면 워커가 기본값 사용. */
  clusterDistance?: number
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
