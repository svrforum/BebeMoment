import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'

export async function findDuplicate(
  familyId: string,
  sha256: string,
  prismaMedia: PrismaMedia,
): Promise<Asset | null> {
  return prismaMedia.asset.findUnique({
    where: { familyId_sha256: { familyId, sha256 } },
  })
}
