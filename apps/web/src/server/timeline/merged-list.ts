import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { JournalEntry, JournalEntryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'

export type TimelineItem =
  | { kind: 'asset'; ts: Date; id: string; asset: Asset }
  | {
      kind: 'journal'
      ts: Date
      id: string
      entry: JournalEntry & { assets: (JournalEntryAsset & { asset: Asset | null })[] }
    }

type Cursor = { ts: string; id: string; kind: 'asset' | 'journal' }

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}

function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (
      typeof c?.ts === 'string' &&
      typeof c?.id === 'string' &&
      (c.kind === 'asset' || c.kind === 'journal')
    ) {
      return c
    }
  } catch {}
  return null
}

export async function listTimeline(
  familyId: string,
  params: { limit?: number; cursor?: string },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  const limit = params.limit ?? 50
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const [assets, entries] = await Promise.all([
    prismaMedia.asset.findMany({
      where: {
        familyId,
        status: 'ready',
        deletedAt: null,
        ...(cursorTs && cur
          ? {
              OR: [{ takenAt: { lt: cursorTs } }, { takenAt: cursorTs, id: { lt: cur.id } }],
            }
          : {}),
      },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    prismaPublic.journalEntry.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(cursorTs && cur
          ? {
              OR: [{ entryDate: { lt: cursorTs } }, { entryDate: cursorTs, id: { lt: cur.id } }],
            }
          : {}),
      },
      include: { assets: true },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
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

  const joinedEntries = entries.map((e) => ({
    ...e,
    assets: e.assets.map((ea) => ({ ...ea, asset: entryAssetById.get(ea.assetId) ?? null })),
  }))

  const merged: TimelineItem[] = [
    ...assets.map<TimelineItem>((a) => ({ kind: 'asset', ts: a.takenAt, id: a.id, asset: a })),
    ...joinedEntries.map<TimelineItem>((e) => ({
      kind: 'journal',
      ts: e.entryDate,
      id: e.id,
      entry: e,
    })),
  ].sort((a, b) => {
    const d = b.ts.getTime() - a.ts.getTime()
    return d !== 0 ? d : b.id.localeCompare(a.id)
  })

  const page = merged.slice(0, limit)
  const hasMore = merged.length > limit
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ ts: last.ts.toISOString(), id: last.id, kind: last.kind })
      : null

  return { items: page, nextCursor }
}
