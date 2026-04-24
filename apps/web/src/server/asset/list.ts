import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from './get'

export async function listAssets(
  args: {
    familyId: string
    limit: number
    cursor?: { takenAt: Date; id: string }
    includeProcessing?: boolean
  },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<AssetWithUrls[]> {
  const assets = await prismaMedia.asset.findMany({
    where: {
      familyId: args.familyId,
      deletedAt: null,
      status: args.includeProcessing ? { in: ['processing', 'ready'] } : 'ready',
      ...(args.cursor
        ? {
            OR: [
              { takenAt: { lt: args.cursor.takenAt } },
              { takenAt: args.cursor.takenAt, id: { lt: args.cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    take: args.limit,
  })
  if (assets.length === 0) return []
  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(args.familyId, readyIds) : {}
  return assets.map((a) => ({ ...a, urls: urlsMap[a.id] ?? null }))
}
