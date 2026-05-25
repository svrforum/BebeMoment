import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type {
  Baby,
  JournalEntry,
  JournalEntryAsset,
  PrismaClient as PrismaPublic,
} from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/get'

export async function getDiaryEntry(
  id: string,
  familyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<
  | (JournalEntry & {
      assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[]
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

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  return {
    ...entry,
    assets: entry.assets.map((ea) => {
      const base = byId.get(ea.assetId) ?? null
      const withUrls: AssetWithUrls | null = base
        ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
        : null
      return { ...ea, asset: withUrls }
    }),
  }
}
