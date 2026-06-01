// 인스턴스 단위로 끄고 켤 수 있는 기능 플래그. 관리자가 설정(`features.<key>`)에서
// 토글하고, 끄면 해당 UI 가 숨고 관련 API 가 거부된다. 기본값은 전부 켜짐.

// faces 만 기본 OFF — 얼굴 인식은 옵트인 서브시스템(모델 다운로드·CPU 처리 필요).
export const FEATURE_FLAGS = [
  'likes',
  'comments',
  'bookmarks',
  'diary',
  'albums',
  'share',
  'faces',
] as const

export type FeatureFlag = (typeof FEATURE_FLAGS)[number]

export type FeatureFlags = Record<FeatureFlag, boolean>

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  likes: true,
  comments: true,
  bookmarks: true,
  diary: true,
  albums: true,
  share: true,
  faces: false,
}

export const FEATURE_FLAG_LABELS: Record<FeatureFlag, { label: string; description: string }> = {
  likes: { label: '좋아요', description: '사진·영상에 좋아요를 누를 수 있어요.' },
  comments: { label: '댓글', description: '사진·영상에 댓글을 달 수 있어요.' },
  bookmarks: { label: '저장함(북마크)', description: '항목을 개인 저장함에 담을 수 있어요.' },
  diary: { label: '일기·기록', description: '일기, 성장 기록, 마일스톤을 작성할 수 있어요.' },
  albums: { label: '앨범', description: '앨범을 만들고 사진을 정리할 수 있어요.' },
  share: { label: '공유 링크', description: '사진·스토리를 가족용 공유 링크로 복사할 수 있어요.' },
  faces: {
    label: '얼굴 인식 (실험적)',
    description: '사진에서 얼굴을 인식해 사람별로 모아줘요. 켜면 모델을 받고 CPU 로 처리해요.',
  },
}

/** 설정 맵(부분)을 받아 누락 키는 기본값(켜짐)으로 채운 완전한 플래그 집합을 만든다. */
export function resolveFeatureFlags(partial: Partial<Record<string, unknown>>): FeatureFlags {
  const out = { ...DEFAULT_FEATURE_FLAGS }
  for (const key of FEATURE_FLAGS) {
    const v = partial[`features.${key}`]
    if (typeof v === 'boolean') out[key] = v
  }
  return out
}
