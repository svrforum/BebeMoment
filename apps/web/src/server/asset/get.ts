import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'

export async function getAssetForFamily(
  args: { assetId: string; familyId: string },
  prismaMedia: PrismaMedia,
): Promise<Asset | null> {
  return prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
}
