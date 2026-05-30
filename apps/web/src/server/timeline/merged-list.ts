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

  // The "?date=" calendar filter always pins to the wall-clock day the
  // moment was experienced (takenAt / entryDate), regardless of sort mode.
  // The sort toggle only changes ordering — not which day a moment "is".
  const [assets, entries] = await Promise.all([
    prismaMedia.asset.findMany({
      where: {
        familyId,
        status: 'ready',
        deletedAt: null,
        duplicateOf: null, // 중복 별칭은 그리드에서 제외(스토리·앨범 참조에서는 표시)
        ...(dayStart && dayEnd ? { takenAt: { gte: dayStart, lt: dayEnd } } : {}),
        ...(cursorTs && cur
          ? sort === 'uploaded'
            ? {
                OR: [{ createdAt: { lt: cursorTs } }, { createdAt: cursorTs, id: { lt: cur.id } }],
              }
            : {
                OR: [{ takenAt: { lt: cursorTs } }, { takenAt: cursorTs, id: { lt: cur.id } }],
              }
          : {}),
      },
      orderBy:
        sort === 'uploaded'
          ? [{ createdAt: 'desc' }, { id: 'desc' }]
          : [{ takenAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prismaPublic.story.findMany({
      where: {
        familyId,
        deletedAt: null,
        // Family viewer sees only family-visible entries; owner /
        // guardian see everything.
        ...(params.viewerRole === 'family' ? { visibility: 'family' } : {}),
        ...(dayStart && dayEnd ? { entryDate: { gte: dayStart, lt: dayEnd } } : {}),
        ...(cursorTs && cur
          ? sort === 'uploaded'
            ? {
                OR: [{ createdAt: { lt: cursorTs } }, { createdAt: cursorTs, id: { lt: cur.id } }],
              }
            : {
                OR: [{ entryDate: { lt: cursorTs } }, { entryDate: cursorTs, id: { lt: cur.id } }],
              }
          : {}),
      },
      include: { assets: true },
      orderBy:
        sort === 'uploaded'
          ? [{ createdAt: 'desc' }, { id: 'desc' }]
          : [{ entryDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
  ])

  const entryAssetIds = Array.from(
    new Set(entries.flatMap((e) => e.assets.map((ea) => ea.assetId))),
  )
  const entryAssets = entryAssetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: entryAssetIds }, familyId } })
    : []
  const entryAssetById = new Map(entryAssets.map((a) => [a.id, a]))

  const allIds = Array.from(
    new Set<string>([
      ...assets.filter((a) => a.status === 'ready').map((a) => a.id),
      ...entryAssets.filter((a) => a.status === 'ready').map((a) => a.id),
    ]),
  )
  const urlsMap = allIds.length ? await media.getAssetUrlsBatch(familyId, allIds) : {}

  const assetsWithUrls: AssetWithUrls[] = assets.map((a) => ({
    ...a,
    urls: urlsMap[a.id] ?? null,
  }))

  const joinedEntries = entries.map((e) => ({
    ...e,
    assets: e.assets.map((ea) => {
      const base = entryAssetById.get(ea.assetId) ?? null
      const withUrls: AssetWithUrls | null = base
        ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
        : null
      return { ...ea, asset: withUrls }
    }),
  }))

  // `ts` is the sort axis — also what the UI groups by (per-UTC-day
  // header). In 'uploaded' mode that's createdAt; in 'taken' it's
  // takenAt / entryDate.
  const merged: TimelineItem[] = [
    ...assetsWithUrls.map<TimelineItem>((a) => ({
      kind: 'asset',
      ts: sort === 'uploaded' ? a.createdAt : a.takenAt,
      id: a.id,
      asset: a,
    })),
    ...joinedEntries.map<TimelineItem>((e) => ({
      kind: 'story',
      ts: sort === 'uploaded' ? e.createdAt : e.entryDate,
      id: e.id,
      entry: e,
    })),
  ].sort((a, b) => {
    // 1차: 표시 시각(takenAt / entryDate 또는 createdAt) 최신순. entryDate 는
    // 날짜만이라 같은 날 글이 여러 개면 동률 → 2차로 createdAt(작성 시각)
    // 최신순으로 깨야 "최신 글이 맨 위"가 보장된다(과거엔 UUID 비교라 작성순과
    // 무관했다). 'uploaded' 모드에선 ts==createdAt 이라 2차는 보통 동률 회피용.
    const d = b.ts.getTime() - a.ts.getTime()
    if (d !== 0) return d
    const ca = (a.kind === 'asset' ? a.asset.createdAt : a.entry.createdAt).getTime()
    const cb = (b.kind === 'asset' ? b.asset.createdAt : b.entry.createdAt).getTime()
    if (cb !== ca) return cb - ca
    return b.id.localeCompare(a.id)
  })

  const page = merged.slice(0, limit)
  const hasMore = merged.length > limit
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ ts: last.ts.toISOString(), id: last.id, kind: last.kind, sort })
      : null

  return { items: page, nextCursor }
}
