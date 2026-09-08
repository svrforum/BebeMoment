import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'
import { decodeCursor, encodeCursor } from '../cursor'
import { hiddenAssetIdsForViewer } from './secret-assets'

type Cursor = { ts: string; id: string }
const isCursor = (c: Record<string, unknown>): c is Cursor =>
  typeof c.ts === 'string' && typeof c.id === 'string'

/** Free-text filter — case-insensitive ILIKE across title and body. */
function textFilter(qRaw: string) {
  const q = qRaw.trim()
  if (!q) return {}
  return {
    OR: [
      { body: { contains: q, mode: 'insensitive' as const } },
      { title: { contains: q, mode: 'insensitive' as const } },
    ],
  }
}

/**
 * Date filter — narrows entryDate to a single UTC day (entryDate is stored as
 * wall-clock-as-UTC; see CLAUDE.md §17). Accepts `YYYY-MM-DD`.
 */
function dateFilter(dateRaw: string): { gte: Date; lt: Date } | null {
  const m = dateRaw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const start = new Date(Date.UTC(year, month, day))
  const end = new Date(Date.UTC(year, month, day + 1))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { gte: start, lt: end }
}

export async function listStoryEntries(
  familyId: string,
  params: {
    babyId?: string
    cursor?: string
    limit?: number
    q?: string
    date?: string
    viewerRole?: 'owner' | 'guardian' | 'family'
  },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{
  items: (Story & { assets: (StoryAsset & { asset: AssetWithUrls | null })[] })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 20
  const cur = params.cursor ? decodeCursor(params.cursor, isCursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  // 키셋 커서: OR 가 정확한 경계, 옆의 lte 는 플래너가 인덱스 시작점으로 쓰는 중복 상한
  // (OR 만으로는 범위를 못 잡는다). 날짜 필터의 entryDate 범위와 같은 키라 합쳐 넣는다.
  const dateRange = params.date ? dateFilter(params.date) : null
  const cursorBound = cursorTs ? { lte: cursorTs } : null
  const entryDateFilter =
    dateRange || cursorBound ? { entryDate: { ...dateRange, ...cursorBound } } : {}

  const items = await prismaPublic.story.findMany({
    where: {
      familyId,
      deletedAt: null,
      // guardians-only entries are hidden from the `family` role
      ...(params.viewerRole === 'family' ? { visibility: 'family' } : {}),
      ...(params.babyId !== undefined ? { babyId: params.babyId } : {}),
      ...(params.q ? textFilter(params.q) : {}),
      ...entryDateFilter,
      ...(cursorTs && cur
        ? {
            OR: [{ entryDate: { lt: cursorTs } }, { entryDate: cursorTs, id: { lt: cur.id } }],
          }
        : {}),
    },
    include: { assets: { orderBy: { order: 'asc' } } },
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = items.length > limit
  const page = items.slice(0, limit)

  // family 가 보는 (가족 공개) 스토리라도, 그 사진이 비밀 스토리에도 속해 있으면
  // 하이드레이션에서 제외(Rule A — 비밀 사진은 어디서도 안 보인다, get.ts 와 동일).
  const hidden = new Set(
    await hiddenAssetIdsForViewer(params.viewerRole ?? 'family', prismaPublic, familyId),
  )
  const allAssetIds = Array.from(
    new Set(page.flatMap((e) => e.assets.map((ea) => ea.assetId).filter((id) => !hidden.has(id)))),
  )
  const assets = allAssetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: allAssetIds }, familyId, deletedAt: null },
      })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  const joined = page.map((e) => ({
    ...e,
    assets: e.assets
      .filter((ea) => !hidden.has(ea.assetId))
      .map((ea) => {
        const base = byId.get(ea.assetId) ?? null
        const withUrls: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
          : null
        return { ...ea, asset: withUrls }
      }),
  }))

  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor({ ts: last.entryDate.toISOString(), id: last.id }) : null
  return { items: joined, nextCursor }
}
