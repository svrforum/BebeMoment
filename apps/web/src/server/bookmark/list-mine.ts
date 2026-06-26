import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetBookmark, PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'
import { decodeCursor, encodeCursor } from '../cursor'

type Cursor = { ts: string; assetId: string }
const isCursor = (c: Record<string, unknown>): c is Cursor =>
  typeof c.ts === 'string' && typeof c.assetId === 'string'

export async function listMyBookmarks(
  familyId: string,
  userId: string,
  params: { cursor?: string; limit?: number; viewerRole?: Role },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{
  items: (AssetBookmark & { asset: AssetWithUrls | null })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 30
  const cur = params.cursor ? decodeCursor(params.cursor, isCursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  // family 가 북마크해 둔 사진이라도 비밀 스토리로 들어갔으면 저장됨에서 제외한다.
  const hidden = new Set(
    await hiddenAssetIdsForViewer(params.viewerRole ?? 'family', prismaPublic, familyId),
  )

  const fetched = await prismaPublic.assetBookmark.findMany({
    where: {
      familyId,
      userId,
      ...(cursorTs
        ? {
            OR: [
              { createdAt: { lt: cursorTs } },
              { createdAt: cursorTs, assetId: { lt: cur!.assetId } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { assetId: 'desc' }],
    take: limit + 1,
  })
  const items = hidden.size ? fetched.filter((b) => !hidden.has(b.assetId)) : fetched

  const hasMore = items.length > limit
  const page = items.slice(0, limit)

  const assetIds = page.map((b) => b.assetId)
  const assets = assetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: assetIds }, familyId, deletedAt: null },
      })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  const joined = page.map((b) => {
    const base = byId.get(b.assetId) ?? null
    const withUrls: AssetWithUrls | null = base
      ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
      : null
    return { ...b, asset: withUrls }
  })

  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ ts: last.createdAt.toISOString(), assetId: last.assetId })
      : null
  return { items: joined, nextCursor }
}
