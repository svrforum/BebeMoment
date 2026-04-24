import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Milestone, MilestoneAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'

export async function listMilestonesByBaby(
  familyId: string,
  babyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<(Milestone & { assets: (MilestoneAsset & { asset: Asset | null })[] })[]> {
  const milestones = await prismaPublic.milestone.findMany({
    where: { familyId, babyId, deletedAt: null },
    include: { assets: true },
    orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
  })

  const allAssetIds = Array.from(
    new Set(milestones.flatMap((m) => m.assets.map((ma) => ma.assetId))),
  )
  const assets = allAssetIds.length
    ? await prismaMedia.asset.findMany({ where: { id: { in: allAssetIds }, familyId } })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  return milestones.map((m) => ({
    ...m,
    assets: m.assets.map((ma) => ({ ...ma, asset: byId.get(ma.assetId) ?? null })),
  }))
}
