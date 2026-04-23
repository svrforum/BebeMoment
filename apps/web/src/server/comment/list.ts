import type { AssetComment, PrismaClient } from '@bebe/db'

export async function listComments(
  familyId: string,
  assetId: string,
  prisma: PrismaClient,
): Promise<
  (AssetComment & {
    author: { id: string; displayName: string; avatarPath: string | null }
  })[]
> {
  return prisma.assetComment.findMany({
    where: { familyId, assetId },
    include: {
      author: { select: { id: true, displayName: true, avatarPath: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}
