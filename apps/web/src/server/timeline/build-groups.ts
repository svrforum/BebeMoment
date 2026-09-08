import { type StoryCardData, storyCardDataFromEntry } from '@/components/story/story-card'
import { type GridAssetUrls, toGridUrls } from '@/lib/asset-url'
import { formatDDay, groupAssetsByDay } from './group-by-day'
import type { TimelineItem, TimelineSort } from './merged-list'

export type TimelineBucketGroup = {
  dateKey: string
  label: string
  ageLabel?: string | null
  dDay?: string | null
  assets: {
    id: string
    publicNo: number
    status: 'uploading' | 'processing' | 'ready' | 'failed'
    kind: 'image' | 'video'
    urls: GridAssetUrls | null
    ts: Date
    durationMs: number | null
  }[]
  stories?: StoryCardData[]
}

const utcDayKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`

/**
 * 타임라인 items(asset+story) → 날짜 버킷 그룹. 페이지 SSR 과 무한스크롤 load-more
 * API 가 같은 변환을 쓰도록 추출(클라가 append 할 때 동일 형상 보장).
 * includeStories=false 면 스토리를 버킷에 얹지 않는다(날짜필터 모드는 StoryStrip 으로 별도 표시).
 */
export function buildTimelineGroups(args: {
  items: TimelineItem[]
  birthDate: Date | null
  sortMode: TimelineSort
  includeStories?: boolean
}): TimelineBucketGroup[] {
  const { items, birthDate, sortMode } = args
  const includeStories = args.includeStories ?? true
  const assetItems = items.filter((it) => it.kind === 'asset')
  const storyItems = items.filter((it) => it.kind === 'story')

  const groups = groupAssetsByDay(
    assetItems.map((it) => {
      const a = it.kind === 'asset' ? it.asset : null
      if (!a) throw new Error('unreachable')
      return {
        id: a.id,
        publicNo: a.publicNo,
        ts: sortMode === 'uploaded' ? a.createdAt : a.takenAt,
        status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
        kind: a.kind as 'image' | 'video',
        urls: a.urls,
        durationMs: a.durationMs ?? null,
      }
    }),
    birthDate,
  ).map((g) => ({
    dateKey: g.dateKey,
    label: g.dateLabel,
    ageLabel: g.bucketLabel,
    dDay: g.babyDays !== null ? formatDDay(g.babyDays) : null,
    assets: g.assets.map((a) => ({
      id: a.id,
      publicNo: a.publicNo,
      status: a.status,
      kind: a.kind,
      // 그리드 카드가 쓰는 것만 실어 보낸다 — merged-list 가 이미 썸네일 티어만
      // 받아오지만, 캐시에 남은 전 티어 응답이 그대로 나가는 것도 여기서 막힌다.
      urls: toGridUrls(a.urls),
      ts: a.ts,
      durationMs: a.durationMs ?? null,
    })),
  }))

  if (!includeStories) return groups.map((g) => ({ ...g, stories: [] }))

  const dayOfAsset = (a: { takenAt: Date; createdAt: Date }): string =>
    utcDayKey(sortMode === 'uploaded' ? a.createdAt : a.takenAt)
  const storiesByDate = new Map<string, Map<string, StoryCardData>>()
  for (const it of storyItems) {
    if (it.kind !== 'story') continue
    const e = it.entry
    const days = new Set(e.assets.flatMap((ea) => (ea.asset ? [dayOfAsset(ea.asset)] : [])))
    for (const dk of days) {
      const dayMap = storiesByDate.get(dk) ?? new Map<string, StoryCardData>()
      if (!dayMap.has(e.id)) dayMap.set(e.id, storyCardDataFromEntry(e))
      storiesByDate.set(dk, dayMap)
    }
  }
  return groups.map((g) => ({
    ...g,
    stories: Array.from(storiesByDate.get(g.dateKey)?.values() ?? []),
  }))
}
