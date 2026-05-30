import type { AssetWithUrls } from '@/server/asset/types'
import { type MemoryInterval, intervalLabel, intervalMonths, memoryInterval } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

export type MemoryStory = Story & { assets: (StoryAsset & { asset: AssetWithUrls | null })[] }

export type MemoryGroup = {
  interval: MemoryInterval
  label: string
  assets: AssetWithUrls[]
  stories: MemoryStory[]
}

type ViewerRole = 'owner' | 'guardian' | 'family'

/**
 * 오늘과 "같은 일(日)이면서 정확히 N개월/N년 전"인 사진·스토리를 간격별로 묶어 반환한다.
 * 날짜 기준은 UTC(takenAt = wall-clock-as-UTC, 타임라인과 정합). 1차로 같은 일(日)·과거를
 * raw 로 좁히고, `memoryInterval` 로 whole-month 만 정밀 필터한다. 정렬은 먼 과거(큰 간격)
 * 먼저 — "1년 전 오늘"이 "6개월 전 오늘" 위에.
 */
export async function listMemories(
  args: { familyId: string; today: Date; viewerRole: ViewerRole },
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<MemoryGroup[]> {
  const { familyId, today, viewerRole } = args
  const day = today.getUTCDate()
  const todayStr = today.toISOString().slice(0, 10)

  const assetIdRows = await prismaMedia.$queryRaw<{ id: string }[]>`
    SELECT id FROM media.assets
    WHERE family_id = ${familyId}::uuid
      AND deleted_at IS NULL AND status = 'ready' AND duplicate_of IS NULL
      AND EXTRACT(DAY FROM taken_at) = ${day}::int
      AND taken_at::date < ${todayStr}::date
  `
  const assetIds = assetIdRows.map((r) => r.id)
  const assets = assetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: assetIds }, familyId } })
    : []

  const storyIdRows = await prismaPublic.$queryRaw<{ id: string }[]>`
    SELECT id FROM stories
    WHERE family_id = ${familyId}::uuid AND deleted_at IS NULL
      AND EXTRACT(DAY FROM entry_date) = ${day}::int
      AND entry_date::date < ${todayStr}::date
  `
  const storyIds = storyIdRows.map((r) => r.id)
  const stories = storyIds.length
    ? await prismaPublic.story.findMany({
        where: {
          id: { in: storyIds },
          familyId,
          ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
        },
        include: { assets: true },
      })
    : []

  const storyAssetIds = Array.from(new Set(stories.flatMap((s) => s.assets.map((a) => a.assetId))))
  const storyAssets = storyAssetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: storyAssetIds }, familyId } })
    : []
  const storyAssetById = new Map(storyAssets.map((a) => [a.id, a]))

  const allUrlIds = Array.from(
    new Set<string>([
      ...assets.map((a) => a.id),
      ...storyAssets.filter((a) => a.status === 'ready').map((a) => a.id),
    ]),
  )
  const urls = allUrlIds.length ? await media.getAssetUrlsBatch(familyId, allUrlIds) : {}

  const groups = new Map<string, MemoryGroup>()
  const ensure = (iv: MemoryInterval): MemoryGroup => {
    const key = `${iv.kind}-${iv.n}`
    let g = groups.get(key)
    if (!g) {
      g = { interval: iv, label: intervalLabel(iv), assets: [], stories: [] }
      groups.set(key, g)
    }
    return g
  }

  for (const a of assets) {
    const iv = memoryInterval(today, a.takenAt)
    if (!iv) continue
    ensure(iv).assets.push({ ...a, urls: urls[a.id] ?? null })
  }

  for (const s of stories) {
    const iv = memoryInterval(today, s.entryDate)
    if (!iv) continue
    const withAssets: MemoryStory = {
      ...s,
      assets: s.assets.map((ea) => {
        const base = storyAssetById.get(ea.assetId) ?? null
        const asset: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? (urls[base.id] ?? null) : null }
          : null
        return { ...ea, asset }
      }),
    }
    ensure(iv).stories.push(withAssets)
  }

  return [...groups.values()].sort(
    (a, b) => intervalMonths(b.interval) - intervalMonths(a.interval),
  )
}
