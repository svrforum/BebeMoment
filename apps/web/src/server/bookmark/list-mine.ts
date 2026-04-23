import type { Asset, AssetBookmark, PrismaClient } from '@bebe/db'

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
  prisma: PrismaClient,
): Promise<{
  items: (AssetBookmark & { asset: Asset })[]
  nextCursor: string | null
}> {
  const limit = params.limit ?? 30
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const items = await prisma.assetBookmark.findMany({
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
    include: { asset: true },
    orderBy: [{ createdAt: 'desc' }, { assetId: 'desc' }],
    take: limit + 1,
  })

  const hasMore = items.length > limit
  const page = items.slice(0, limit)
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ ts: last.createdAt.toISOString(), assetId: last.assetId })
      : null
  return { items: page, nextCursor }
}
