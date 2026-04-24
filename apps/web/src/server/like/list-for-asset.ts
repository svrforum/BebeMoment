import type { PrismaClient } from '@bebe/db-public'

export async function likersForAsset(
  familyId: string,
  assetId: string,
  prisma: PrismaClient,
): Promise<{
  count: number
  users: { id: string; displayName: string; avatarPath: string | null }[]
}> {
  const likes = await prisma.assetLike.findMany({
    where: { assetId, familyId },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, displayName: true, avatarPath: true } },
    },
  })
  return {
    count: likes.length,
    users: likes.map((l) => l.user),
  }
}
