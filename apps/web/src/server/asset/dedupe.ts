import type { Asset, PrismaClient } from '@bebe/db'

export async function findDuplicate(
  familyId: string,
  sha256: string,
  prisma: PrismaClient,
): Promise<Asset | null> {
  return prisma.asset.findUnique({
    where: { familyId_sha256: { familyId, sha256 } },
  })
}
