import type { GrowthRecord, PrismaClient } from '@bebe/db-public'

export async function listGrowthByBaby(
  familyId: string,
  babyId: string,
  prisma: PrismaClient,
): Promise<GrowthRecord[]> {
  return prisma.growthRecord.findMany({
    where: { familyId, babyId, deletedAt: null },
    orderBy: [{ measuredAt: 'asc' }, { createdAt: 'asc' }],
  })
}
