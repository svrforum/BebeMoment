import type { StoryCardData } from '@/components/story/story-card'
import type { AssetUrls } from '@bebe/media-client'

export type AssetRow = {
  id: string
  publicNo: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
  /** ts 는 디바이더(여기까지 봤어요) 경계 계산에 쓰인다 — 없어도 그리드는 동작. */
  ts?: Date
}

export type BucketGroup = {
  /** UTC 일자 키 — append 시 같은 날 버킷 병합 기준. */
  dateKey: string
  label: string
  /** Optional age-bucket secondary line (e.g. "생후 47일"). */
  ageLabel?: string | null
  /** Optional D-day chip (e.g. "D+97" / "D-Day"). */
  dDay?: string | null
  assets: AssetRow[]
  /** 이 날짜의 스토리(사진 그리드 위에 글 카드로). */
  stories?: StoryCardData[]
}

// append 시 같은 날(dateKey) 버킷은 병합(자산·스토리 id 중복 제거), 나머지는 이어붙임.
export function mergeGroups(prev: BucketGroup[], next: BucketGroup[]): BucketGroup[] {
  if (next.length === 0) return prev
  const out = [...prev]
  const last = out[out.length - 1]
  let start = 0
  if (last && next[0] && last.dateKey === next[0].dateKey) {
    const seen = new Set(last.assets.map((a) => a.id))
    const storySeen = new Set((last.stories ?? []).map((s) => s.id))
    out[out.length - 1] = {
      ...last,
      assets: [...last.assets, ...next[0].assets.filter((a) => !seen.has(a.id))],
      stories: [
        ...(last.stories ?? []),
        ...(next[0].stories ?? []).filter((s) => !storySeen.has(s.id)),
      ],
    }
    start = 1
  }
  return [...out, ...next.slice(start)]
}

export type Reconciled = {
  groups: BucketGroup[]
  /** false = 이어붙이지 못해 첫 페이지만 남았다 → 커서·페이지 수를 새로 받은 값으로 되돌려야 한다. */
  keptPages: boolean
}

/**
 * 서버가 새로 준 **첫 페이지**(`fresh`)를 이미 불러온 목록(`loaded`) 위에 얹는다.
 *
 * 예전에는 새 `initialGroups` 가 오면 상태를 통째로 갈아끼웠다 — 5페이지까지 스크롤한
 * 사람이 남의 업로드 하나에 1페이지로 되돌아갔다. 첫 페이지는 항상 목록의 머리이므로,
 * 머리만 새 데이터로 바꾸고 그 아래(사용자가 추가로 불러온 페이지들)는 그대로 둔다.
 *
 * 경계는 `fresh` 의 마지막 자산이다 — 그 자산이 `loaded` 에서 있던 자리 뒤쪽이 꼬리.
 * 그 앞쪽에서 `fresh` 에 없는 자산은 지워진 것이므로 함께 사라진다. 겹치는 지점을 못
 * 찾으면(그날 전체가 새 사진 등) 안전하게 첫 페이지만 남긴다.
 */
export function reconcileHead(loaded: BucketGroup[], fresh: BucketGroup[]): Reconciled {
  const reset: Reconciled = { groups: fresh, keptPages: false }
  const lastFresh = fresh[fresh.length - 1]
  if (!lastFresh || loaded.length === 0) return reset
  const boundary = lastFresh.assets[lastFresh.assets.length - 1]
  if (!boundary) return reset
  const dayIndex = loaded.findIndex((g) => g.dateKey === lastFresh.dateKey)
  if (dayIndex < 0) return reset
  const loadedDay = loaded[dayIndex]
  if (!loadedDay) return reset
  const boundaryPos = loadedDay.assets.findIndex((a) => a.id === boundary.id)
  if (boundaryPos < 0) return reset

  const freshIds = new Set(lastFresh.assets.map((a) => a.id))
  const tail = loadedDay.assets.slice(boundaryPos + 1).filter((a) => !freshIds.has(a.id))
  const head = [...fresh]
  if (tail.length > 0) {
    head[head.length - 1] = { ...lastFresh, assets: [...lastFresh.assets, ...tail] }
  }
  return { groups: [...head, ...loaded.slice(dayIndex + 1)], keptPages: true }
}

// 아래 상수들은 아직 렌더된 적 없는 섹션의 `contain-intrinsic-size` 자리표시 높이를
// 만드는 데만 쓴다. 한 번 렌더되면 `auto` 키워드가 실제 높이를 기억하므로 어긋나도
// 스크롤바가 한 번 흔들릴 뿐 레이아웃은 자기 교정된다.
// ⚠️ COLLAPSED_ASSETS/COLLAPSED_STORIES 는 bucket-section.tsx 의 COLLAPSED_COUNT /
// STORY_COLLAPSE 와 같은 값이어야 한다(그쪽이 접힘 기본값의 정본).
const COLLAPSED_ASSETS = 6
const COLLAPSED_STORIES = 2
const GRID_COLUMNS_ESTIMATE = 3
const ROW_PX = 124
const HEADER_PX = 56
const STORY_CARD_PX = 84
const MORE_BUTTON_PX = 44
const SECTION_GAP_PX = 40

export function estimateSectionHeight(section: { assetCount: number; storyCount: number }): number {
  const shownAssets = Math.min(section.assetCount, COLLAPSED_ASSETS)
  const shownStories = Math.min(section.storyCount, COLLAPSED_STORIES)
  const rows = Math.ceil(shownAssets / GRID_COLUMNS_ESTIMATE)
  const moreButtons =
    (section.assetCount > COLLAPSED_ASSETS ? MORE_BUTTON_PX : 0) +
    (section.storyCount > COLLAPSED_STORIES ? MORE_BUTTON_PX : 0)
  return HEADER_PX + SECTION_GAP_PX + shownStories * STORY_CARD_PX + rows * ROW_PX + moreButtons
}
