import type { Asset, JournalEntry, JournalEntryAsset, PrismaClient } from '@bebe/db'

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

export async function listJournalEntries(
  familyId: string,
  params: { babyId?: string; cursor?: string; limit?: number },
  prisma: PrismaClient,
): Promise<{
  items: (JournalEntry & { assets: (JournalEntryAsset & { asset: Asset })[] })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 20
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const items = await prisma.journalEntry.findMany({
    where: {
      familyId,
      deletedAt: null,
      ...(params.babyId !== undefined ? { babyId: params.babyId } : {}),
      ...(cursorTs && cur
        ? {
            OR: [
              { entryDate: { lt: cursorTs } },
              { entryDate: cursorTs, id: { lt: cur.id } },
            ],
          }
        : {}),
    },
    include: { assets: { include: { asset: true } } },
    orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = items.length > limit
  const page = items.slice(0, limit)
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor({ ts: last.entryDate.toISOString(), id: last.id }) : null
  return { items: page, nextCursor }
}
