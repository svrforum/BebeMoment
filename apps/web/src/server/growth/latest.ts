import type { GrowthRecord, PrismaClient } from '@bebe/db-public'

export async function latestGrowth(
  familyId: string,
  babyId: string,
  prisma: PrismaClient,
): Promise<GrowthRecord | null> {
  return prisma.growthRecord.findFirst({
    where: { familyId, babyId, deletedAt: null },
    orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
  })
}
