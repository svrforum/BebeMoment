import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Milestone, MilestoneAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/get'

export async function listMilestonesByBaby(
  familyId: string,
  babyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<(Milestone & { assets: (MilestoneAsset & { asset: AssetWithUrls | null })[] })[]> {
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

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  return milestones.map((m) => ({
    ...m,
    assets: m.assets.map((ma) => {
      const base = byId.get(ma.assetId) ?? null
      const withUrls: AssetWithUrls | null = base
        ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
        : null
      return { ...ma, asset: withUrls }
    }),
  }))
}
