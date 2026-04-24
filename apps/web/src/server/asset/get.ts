import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

export type AssetWithUrls = Asset & { urls: AssetUrls | null }

export async function getAssetForFamily(
  args: { assetId: string; familyId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<AssetWithUrls | null> {
  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
  if (!asset) return null
  const urls = asset.status === 'ready' ? await media.getAssetUrls(asset.id, args.familyId) : null
  return { ...asset, urls }
}
