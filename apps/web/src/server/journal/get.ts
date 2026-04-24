import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Baby, JournalEntry, JournalEntryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'

export async function getJournalEntry(
  id: string,
  familyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<
  | (JournalEntry & {
      assets: (JournalEntryAsset & { asset: Asset | null })[]
      baby: Baby | null
    })
  | null
> {
  const entry = await prismaPublic.journalEntry.findFirst({
    where: { id, familyId, deletedAt: null },
    include: { assets: true, baby: true },
  })
  if (!entry) return null

  const assetIds = entry.assets.map((ea) => ea.assetId)
  const assets = assetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: assetIds }, familyId } })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  return {
    ...entry,
    assets: entry.assets.map((ea) => ({ ...ea, asset: byId.get(ea.assetId) ?? null })),
  }
}
