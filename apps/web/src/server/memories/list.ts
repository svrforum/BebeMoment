import type { AssetWithUrls } from '@/server/asset/types'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import { type MemoryInterval, intervalMonths, memoryInterval } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { GRID_URL_TIERS } from '@/lib/asset-url'
import type { AssetUrlTier, AssetUrls, MediaClient } from '@bebe/media-client'

export type MemoryStory = Story & { assets: (StoryAsset & { asset: AssetWithUrls | null })[] }

export type MemoryGroup = {
  interval: MemoryInterval
  assets: AssetWithUrls[]
  stories: MemoryStory[]
}

type ViewerRole = 'owner' | 'guardian' | 'family'

type MemoryArgs = {
  familyId: string
  today: Date
  viewerRole: ViewerRole
  /** 그룹당 앞에서 N장만 signed URL 을 받는다(나머지는 `urls: null`). 타임라인 카드는 4장,
   *  위젯은 10장만 그리므로 후보 전부를 서명하면 낭비다. 생략 시 전부(추억 페이지). 제한
   *  모드에선 스토리 사진도 서명하지 않는다(카드·위젯이 안 씀). */
  signLimit?: number
  /** 어느 티어를 서명받을지. 기본은 그리드용 썸네일 — 추억 카드·타임라인 스트립이
   *  썸네일만 그린다. 위젯은 큰 사진을 내려받으므로 `['display']` 로 부른다. */
  tiers?: readonly AssetUrlTier[]
}

type DayWindow = { gte: Date; lt: Date }

/**
 * `today` 와 같은 일(日)인 과거 달들의 UTC 하루 창. `memoryInterval` 이 추억으로 치는
 * 날짜(같은 일·정수 달 전)를 그대로 열거하므로 `EXTRACT(DAY)` 풀스캔 대신 (family_id,
 * taken_at) 인덱스 range 로 조회할 수 있다. 그 일이 없는 달(31일·윤일)은 창을 만들지
 * 않고, `earliest` 가 속한 달까지 보고 멈춘다.
 */
export function memoryDayWindows(today: Date, earliest: Date): DayWindow[] {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const d = today.getUTCDate()
  const out: DayWindow[] = []
  for (let k = 1; Date.UTC(y, m - k + 1, 1) > earliest.getTime(); k += 1) {
    const start = new Date(Date.UTC(y, m - k, d))
    if (start.getUTCDate() !== d) continue
    out.push({ gte: start, lt: new Date(Date.UTC(y, m - k, d + 1)) })
  }
  return out
}

type AssetRow = Awaited<ReturnType<PrismaMedia['asset']['findMany']>>[number]

type CollectedMemoryData = {
  today: Date
  assets: AssetRow[]
  stories: (Story & { assets: StoryAsset[] })[]
  storyAssetById: Map<string, AssetRow>
}

async function collectMemoryData(
  args: { familyId: string; today: Date; viewerRole: ViewerRole },
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
): Promise<CollectedMemoryData> {
  const { familyId, today, viewerRole } = args
  const liveAsset = { familyId, deletedAt: null, status: 'ready' as const, duplicateOf: null }
  const visibleStory = {
    familyId,
    deletedAt: null,
    ...(viewerRole === 'family' ? { visibility: 'family' as const } : {}),
  }

  // 비밀 스토리(guardians) 사진은 family 에게 단독 사진·스토리 썸네일 모두에서 숨긴다.
  const [hiddenIds, earliestAsset, earliestStory] = await Promise.all([
    hiddenAssetIdsForViewer(viewerRole, prismaPublic, familyId),
    prismaMedia.asset.findFirst({
      where: liveAsset,
      orderBy: { takenAt: 'asc' },
      select: { takenAt: true },
    }),
    prismaPublic.story.findFirst({
      where: visibleStory,
      orderBy: { entryDate: 'asc' },
      select: { entryDate: true },
    }),
  ])
  const hidden = new Set(hiddenIds)

  const assetWindows = earliestAsset ? memoryDayWindows(today, earliestAsset.takenAt) : []
  const assets = assetWindows.length
    ? await prismaMedia.asset.findMany({
        where: {
          ...liveAsset,
          ...(hidden.size ? { id: { notIn: [...hidden] } } : {}),
          OR: assetWindows.map((w) => ({ takenAt: w })),
        },
        orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      })
    : []

  const storyWindows = earliestStory ? memoryDayWindows(today, earliestStory.entryDate) : []
  const stories = storyWindows.length
    ? await prismaPublic.story.findMany({
        where: { ...visibleStory, OR: storyWindows.map((w) => ({ entryDate: w })) },
        include: { assets: { orderBy: { order: 'asc' } } },
        orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      })
    : []

  const storyAssetIds = Array.from(
    new Set(stories.flatMap((s) => s.assets.map((a) => a.assetId))),
  ).filter((id) => !hidden.has(id))
  const storyAssets = storyAssetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: storyAssetIds }, familyId, deletedAt: null },
      })
    : []
  const storyAssetById = new Map(storyAssets.map((a) => [a.id, a]))

  return { today, assets, stories, storyAssetById }
}

function buildMemoryGroups(data: CollectedMemoryData): MemoryGroup[] {
  const { today, assets, stories, storyAssetById } = data
  const groups = new Map<string, MemoryGroup>()
  const ensure = (iv: MemoryInterval): MemoryGroup => {
    const key = `${iv.kind}-${iv.n}`
    let g = groups.get(key)
    if (!g) {
      g = { interval: iv, assets: [], stories: [] }
      groups.set(key, g)
    }
    return g
  }

  for (const a of assets) {
    const iv = memoryInterval(today, a.takenAt)
    if (!iv) continue
    ensure(iv).assets.push({ ...a, urls: null })
  }

  for (const s of stories) {
    const iv = memoryInterval(today, s.entryDate)
    if (!iv) continue
    const withAssets: MemoryStory = {
      ...s,
      assets: s.assets.map((ea) => {
        const base = storyAssetById.get(ea.assetId) ?? null
        return { ...ea, asset: base ? { ...base, urls: null } : null }
      }),
    }
    ensure(iv).stories.push(withAssets)
  }

  return [...groups.values()].sort(
    (a, b) => intervalMonths(b.interval) - intervalMonths(a.interval),
  )
}

function signTargets(groups: MemoryGroup[], signLimit: number | undefined): string[] {
  const ids = new Set<string>()
  for (const g of groups) {
    for (const a of g.assets.slice(0, signLimit ?? g.assets.length)) ids.add(a.id)
    if (signLimit !== undefined) continue
    for (const s of g.stories) {
      for (const ea of s.assets) if (ea.asset?.status === 'ready') ids.add(ea.asset.id)
    }
  }
  return [...ids]
}

function attachUrls(groups: MemoryGroup[], urls: Record<string, AssetUrls>): MemoryGroup[] {
  const withUrls = (a: AssetWithUrls): AssetWithUrls => ({ ...a, urls: urls[a.id] ?? null })
  return groups.map((g) => ({
    ...g,
    assets: g.assets.map(withUrls),
    stories: g.stories.map((s) => ({
      ...s,
      assets: s.assets.map((ea) => ({ ...ea, asset: ea.asset ? withUrls(ea.asset) : null })),
    })),
  }))
}

/**
 * 오늘과 "같은 일(日)이면서 정확히 N개월/N년 전"인 사진·스토리를 간격별로 묶어 반환한다.
 * 날짜 기준은 UTC(takenAt = wall-clock-as-UTC, 타임라인과 정합). 후보 날짜 창을 JS 에서
 * 열거해(`memoryDayWindows`) 인덱스 range 로 읽고, `memoryInterval` 로 whole-month 만 정밀
 * 필터한다. 정렬은 먼 과거(큰 간격) 먼저 — "1년 전 오늘"이 "6개월 전 오늘" 위에.
 */
export async function listMemories(
  args: MemoryArgs,
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<MemoryGroup[]> {
  const groups = buildMemoryGroups(await collectMemoryData(args, prismaMedia, prismaPublic))
  const ids = signTargets(groups, args.signLimit)
  const urls = ids.length
    ? await media.getAssetUrlsBatch(args.familyId, ids, { tiers: args.tiers ?? GRID_URL_TIERS })
    : {}
  return attachUrls(groups, urls)
}

/**
 * 추억 그룹을 미디어 URL 없이 반환(간격별 개수만 필요한 알림 스캔 워커용). 매일 스캔이
 * media 서비스를 호출하지 않게 한다 — 카운트만 보는 decideMemoryPush 에 충분.
 */
export async function listMemoryGroupsForCount(
  args: { familyId: string; today: Date; viewerRole: ViewerRole },
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
): Promise<MemoryGroup[]> {
  return buildMemoryGroups(await collectMemoryData(args, prismaMedia, prismaPublic))
}
