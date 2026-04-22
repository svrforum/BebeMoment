import type { Asset, Milestone, MilestoneAsset, PrismaClient } from '@bebe/db'

export async function listMilestonesByBaby(
  familyId: string,
  babyId: string,
  prisma: PrismaClient,
): Promise<(Milestone & { assets: (MilestoneAsset & { asset: Asset })[] })[]> {
  return prisma.milestone.findMany({
    where: { familyId, babyId, deletedAt: null },
    include: { assets: { include: { asset: true } } },
    orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
  })
}
