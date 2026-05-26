import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { JournalEntry, JournalEntryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

type Cursor = { ts: string; id: string }

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (typeof c?.ts === 'string' && typeof c?.id === 'string') return c
  } catch {}
  return null
}

export async function listDiaryEntries(
  familyId: string,
  params: { babyId?: string; cursor?: string; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{
  items: (JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 20
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const items = await prismaPublic.journalEntry.findMany({
    where: {
      familyId,
      deletedAt: null,
      ...(params.babyId !== undefined ? { babyId: params.babyId } : {}),
      ...(cursorTs && cur
        ? {
            OR: [{ entryDate: { lt: cursorTs } }, { entryDate: cursorTs, id: { lt: cur.id } }],
          }
        : {}),
    },
    include: { assets: true },
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = items.length > limit
  const page = items.slice(0, limit)

  const allAssetIds = Array.from(new Set(page.flatMap((e) => e.assets.map((ea) => ea.assetId))))
  const assets = allAssetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: allAssetIds }, familyId } })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  const joined = page.map((e) => ({
    ...e,
    assets: e.assets.map((ea) => {
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
