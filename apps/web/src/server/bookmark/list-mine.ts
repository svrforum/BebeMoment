import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetBookmark, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

type Cursor = { ts: string; assetId: string }

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (typeof c?.ts === 'string' && typeof c?.assetId === 'string') return c
  } catch {}
  return null
}

export async function listMyBookmarks(
  familyId: string,
  userId: string,
  params: { cursor?: string; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{
  items: (AssetBookmark & { asset: AssetWithUrls | null })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 30
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const items = await prismaPublic.assetBookmark.findMany({
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
