import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

export type TimelineItem =
  | { kind: 'asset'; ts: Date; id: string; asset: AssetWithUrls }
  | {
      kind: 'story'
      ts: Date
      id: string
      entry: Story & {
        assets: (StoryAsset & { asset: AssetWithUrls | null })[]
      }
    }

export type TimelineSort = 'taken' | 'uploaded'

type Cursor = {
  ts: string
  id: string
  kind: 'asset' | 'story'
  /** Which timestamp field the cursor is relative to. Omitted = 'taken'
   *  (back-compat with cursors minted before the sort toggle existed). */
  sort?: TimelineSort
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}

function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (
      typeof c?.ts === 'string' &&
      typeof c?.id === 'string' &&
      (c.kind === 'asset' || c.kind === 'story')
    ) {
      return c
    }
  } catch {}
  return null
}

export async function listTimeline(
  familyId: string,
  params: {
    limit?: number
    cursor?: string
    /** Single-day filter (YYYY-MM-DD, UTC day). takenAt/entryDate 가 저장된
     *  값(벽시계 시각을 UTC 로 저장)과 같은 UTC 일자로 매칭 → 캘린더 셀과 정합. */
    date?: string
    /** Viewer's role — drives diary-entry visibility filtering. Defaults
     *  to 'family' which is the most restrictive (won't see guardians-only
     *  entries). Pass 'owner' / 'guardian' to include them. */
    viewerRole?: 'owner' | 'guardian' | 'family'
    /** Sort order. 'taken' (default) = by `takenAt` / `entryDate` desc —
     *  groups reflect when the moment happened. 'uploaded' = by
     *  `createdAt` desc — groups reflect when the item was added to the
     *  app. Cursor is mode-aware. */
    sort?: TimelineSort
  },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  const limit = params.limit ?? 50
  const sort: TimelineSort = params.sort ?? 'taken'
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  // Cursors are mode-tagged. If the request mode differs from the cursor's
  // mode (e.g. user flipped the toggle mid-scroll), the cursor is stale —
  // start a fresh page instead of mixing axes.
  const cursorValid = cur ? (cur.sort ?? 'taken') === sort : false
  const cursorTs = cur && cursorValid ? new Date(cur.ts) : null

  let dayStart: Date | null = null
  let dayEnd: Date | null = null
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    dayStart = new Date(`${params.date}T00:00:00.000Z`)
    dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  }

  // Model B — 사진(자산)이 페이지네이션을 주도하고, 스토리는 "안에 든 사진이
  // 찍힌 날"을 따라간다(스토리 자신의 entryDate/작성일이 아니라). 그래서 자산을
  // 먼저 페이징한 뒤, 그 페이지 자산을 소유한 스토리를 역으로 찾아 같이 싣는다.
  // (StoryAsset 은 cross-schema 라 한 쿼리 조인 불가 — assetId in 으로 멤버십만
  // 끌어와 storyId 해석.)
  const assetRows = await prismaMedia.asset.findMany({
    where: {
      familyId,
      status: 'ready',
      deletedAt: null,
      duplicateOf: null, // 중복 별칭은 그리드에서 제외(스토리·앨범 참조에서는 표시)
      ...(dayStart && dayEnd ? { takenAt: { gte: dayStart, lt: dayEnd } } : {}),
      ...(cursorTs && cur
        ? sort === 'uploaded'
          ? { OR: [{ createdAt: { lt: cursorTs } }, { createdAt: cursorTs, id: { lt: cur.id } }] }
          : { OR: [{ takenAt: { lt: cursorTs } }, { takenAt: cursorTs, id: { lt: cur.id } }] }
        : {}),
    },
    orderBy:
      sort === 'uploaded'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : [{ takenAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })
  const hasMore = assetRows.length > limit
  const pageAssets = hasMore ? assetRows.slice(0, limit) : assetRows
  const pageAssetIds = pageAssets.map((a) => a.id)

  // 페이지 자산을 소유한 스토리 멤버십 → 스토리 본문(가시성 필터).
  const memberships = pageAssetIds.length
    ? await prismaPublic.storyAsset.findMany({
        where: { assetId: { in: pageAssetIds } },
        select: { entryId: true },
      })
    : []
  const storyIds = Array.from(new Set(memberships.map((m) => m.entryId)))
  const entries = storyIds.length
    ? await prismaPublic.story.findMany({
        where: {
          id: { in: storyIds },
          familyId,
          deletedAt: null,
          // Family viewer sees only family-visible entries; owner /
          // guardian see everything.
          ...(params.viewerRole === 'family' ? { visibility: 'family' } : {}),
        },
        include: { assets: true },
      })
    : []

  // 스토리 썸네일을 위해 페이지 밖 자산(다른 날에 찍힌 같은 스토리 사진)도 해석.
  const extraIds = Array.from(
    new Set(
      entries
        .flatMap((e) => e.assets.map((ea) => ea.assetId))
        .filter((id) => !pageAssetIds.includes(id)),
    ),
  )
  const extraAssets = extraIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: extraIds }, familyId, deletedAt: null },
      })
    : []
  const assetById = new Map([...pageAssets, ...extraAssets].map((a) => [a.id, a]))

  const allIds = Array.from(
    new Set<string>(
      [...pageAssets, ...extraAssets].filter((a) => a.status === 'ready').map((a) => a.id),
    ),
  )
  const urlsMap = allIds.length ? await media.getAssetUrlsBatch(familyId, allIds) : {}

  const withUrls = (a: (typeof pageAssets)[number]): AssetWithUrls => ({
    ...a,
    urls: a.status === 'ready' ? (urlsMap[a.id] ?? null) : null,
  })

  const joinedEntries = entries.map((e) => ({
    ...e,
    assets: e.assets
      .slice()
      .sort((x, y) => x.order - y.order)
      .map((ea) => {
        const base = assetById.get(ea.assetId) ?? null
        return { ...ea, asset: base ? withUrls(base) : null }
      }),
  }))

  // `ts` 는 정렬·그룹 축(UTC 일자 헤더). asset=takenAt/createdAt. 스토리는 페이지에
  // 든 자기 사진들 중 가장 최근 날을 대표 ts 로(페이지 그룹핑이 사진별 날짜로 다시
  // 흩뿌리므로 정렬 안정화용일 뿐).
  const tsOf = (a: (typeof pageAssets)[number]): Date =>
    sort === 'uploaded' ? a.createdAt : a.takenAt
  const items: TimelineItem[] = [
    ...pageAssets.map<TimelineItem>((a) => ({
      kind: 'asset',
      ts: tsOf(a),
      id: a.id,
      asset: withUrls(a),
    })),
    ...joinedEntries.map<TimelineItem>((e) => {
      const onPage = e.assets
        .map((ea) => (ea.asset && pageAssetIds.includes(ea.asset.id) ? ea.asset : null))
        .filter((a): a is AssetWithUrls => a !== null)
      const ts = onPage.length
        ? new Date(Math.max(...onPage.map((a) => tsOf(a).getTime())))
        : e.entryDate
      return { kind: 'story', ts, id: e.id, entry: e }
    }),
  ].sort((a, b) => {
    const d = b.ts.getTime() - a.ts.getTime()
    if (d !== 0) return d
    const ca = (a.kind === 'asset' ? a.asset.createdAt : a.entry.createdAt).getTime()
    const cb = (b.kind === 'asset' ? b.asset.createdAt : b.entry.createdAt).getTime()
    if (cb !== ca) return cb - ca
    return b.id.localeCompare(a.id)
  })

  // 페이지네이션은 자산만으로 — 스토리는 그 사진을 따라 같이 실린 파생물이라 커서에
  // 영향 주지 않는다(같은 스토리가 사진이 걸친 여러 페이지에 각각 등장).
  const lastAsset = pageAssets[pageAssets.length - 1]
  const nextCursor =
    hasMore && lastAsset
      ? encodeCursor({ ts: tsOf(lastAsset).toISOString(), id: lastAsset.id, kind: 'asset', sort })
      : null

  return { items, nextCursor }
}
