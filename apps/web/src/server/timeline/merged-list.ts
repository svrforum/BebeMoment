import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { JournalEntry, JournalEntryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

export type TimelineItem =
  | { kind: 'asset'; ts: Date; id: string; asset: AssetWithUrls }
  | {
      kind: 'journal'
      ts: Date
      id: string
      entry: JournalEntry & {
        assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[]
      }
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
  params: {
    limit?: number
    cursor?: string
    /** Single tag (back-compat) — equivalent to tagSlugs of length 1. */
    tagSlug?: string
    /** AND filter: assets matching ALL slugs. */
    tagSlugs?: string[]
    /** Viewer's role — drives diary-entry visibility filtering. Defaults
     *  to 'family' which is the most restrictive (won't see guardians-only
     *  entries). Pass 'owner' / 'guardian' to include them. */
    viewerRole?: 'owner' | 'guardian' | 'family'
  },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  const limit = params.limit ?? 50
  const cur = params.cursor ? decodeCursor(params.cursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  // Resolve the tag filter (single or multi) to an asset_id intersection.
  // Empty resolved set means "matches nothing" — short-circuit.
  const requestedSlugs = params.tagSlugs?.length
    ? params.tagSlugs
    : params.tagSlug
      ? [params.tagSlug]
      : []
  let tagAssetIds: string[] | null = null
  if (requestedSlugs.length > 0) {
    const tagRows = await prismaPublic.tag.findMany({
      where: { familyId, slug: { in: requestedSlugs }, deletedAt: null },
      select: { id: true, slug: true },
    })
    if (tagRows.length !== requestedSlugs.length) {
      // At least one slug is unknown / deleted — AND can't match.
      return { items: [], nextCursor: null }
    }
    const tagIds = tagRows.map((t) => t.id)
    // Find asset ids that have ALL the requested tags. Cap the result so a
    // tag with 100k+ photos doesn't blow Postgres's bind-parameter ceiling
    // when we hand the ids over to media. The cap is intentionally larger
    // than `limit + 1` so cursor pagination still works against the cap.
    const TAG_INTERSECT_CAP = 10_000
    const grouped = await prismaPublic.assetTag.groupBy({
      by: ['assetId'],
      where: { familyId, tagId: { in: tagIds } },
      _count: { tagId: true },
      having: { tagId: { _count: { equals: tagIds.length } } },
      orderBy: { assetId: 'asc' },
      take: TAG_INTERSECT_CAP,
    })
    tagAssetIds = grouped.map((g) => g.assetId)
    if (tagAssetIds.length === 0) {
      return { items: [], nextCursor: null }
    }
  }

  const [assets, entries] = await Promise.all([
    prismaMedia.asset.findMany({
      where: {
        familyId,
        status: 'ready',
        deletedAt: null,
        ...(tagAssetIds ? { id: { in: tagAssetIds } } : {}),
        ...(cursorTs && cur
          ? {
              OR: [{ takenAt: { lt: cursorTs } }, { takenAt: cursorTs, id: { lt: cur.id } }],
            }
          : {}),
      },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }),
    // When filtering by tag, hide diary entries — they're not tagged.
    tagAssetIds
      ? prismaPublic.journalEntry.findMany({
          where: { familyId, id: '00000000-0000-0000-0000-000000000000' },
          include: { assets: true },
        })
      : prismaPublic.journalEntry.findMany({
          where: {
            familyId,
            deletedAt: null,
            // Family viewer sees only family-visible entries; owner /
            // guardian see everything.
            ...(params.viewerRole === 'family' ? { visibility: 'family' } : {}),
            ...(cursorTs && cur
              ? {
                  OR: [
                    { entryDate: { lt: cursorTs } },
                    { entryDate: cursorTs, id: { lt: cur.id } },
                  ],
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

  const merged: TimelineItem[] = [
    ...assetsWithUrls.map<TimelineItem>((a) => ({
      kind: 'asset',
      ts: a.takenAt,
      id: a.id,
      asset: a,
    })),
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
