import type { Asset, PrismaClient } from '@bebe/db'

export async function getAssetForFamily(
  args: { assetId: string; familyId: string },
  prisma: PrismaClient,
): Promise<Asset | null> {
  return prisma.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
}
