import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/get'

/**
 * List ready assets attached to an album, with signed urls populated.
 * Sorted by sort_index then added_at — preserving the order users set.
 */
export async function listAlbumAssets(
  args: { albumId: string; familyId: string; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<AssetWithUrls[]> {
  const limit = args.limit ?? 200

  const links = await prismaPublic.albumAsset.findMany({
    where: { albumId: args.albumId, familyId: args.familyId },
    orderBy: [{ sortIndex: 'asc' }, { addedAt: 'asc' }],
    take: limit,
  })
  if (links.length === 0) return []

  const assets = await prismaMedia.asset.findMany({
    where: {
      id: { in: links.map((l) => l.assetId) },
      familyId: args.familyId,
      deletedAt: null,
    },
  })
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length
    ? await media.getAssetUrlsBatch(args.familyId, readyIds)
    : {}

  // Preserve link order (sort_index then added_at).
  return links
    .map((l) => byId.get(l.assetId))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({ ...a, urls: urlsMap[a.id] ?? null }))
}
