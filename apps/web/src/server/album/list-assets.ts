import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/get'

export type ListAlbumAssetsResult = {
  assets: AssetWithUrls[]
  total: number
  truncated: boolean
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

/**
 * List ready assets attached to an album.
 *
 * Returns the actual `total` separately from the page so the UI can show
 * "200장 중 200장 (더 보기 곧)" and we don't silently truncate large
 * albums. CLAUDE.md §11 — 조용한 실패 금지.
 */
export async function listAlbumAssets(
  args: { albumId: string; familyId: string; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<ListAlbumAssetsResult> {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const [links, total] = await Promise.all([
    prismaPublic.albumAsset.findMany({
      where: { albumId: args.albumId, familyId: args.familyId },
      orderBy: [{ sortIndex: 'asc' }, { addedAt: 'asc' }],
      take: limit,
    }),
    prismaPublic.albumAsset.count({
      where: { albumId: args.albumId, familyId: args.familyId },
    }),
  ])

  if (links.length === 0) {
    return { assets: [], total, truncated: false }
  }

  const assets = await prismaMedia.asset.findMany({
    where: {
      id: { in: links.map((l) => l.assetId) },
      familyId: args.familyId,
      deletedAt: null,
    },
  })
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(args.familyId, readyIds) : {}

  return {
    assets: links
      .map((l) => byId.get(l.assetId))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ ...a, urls: urlsMap[a.id] ?? null })),
    total,
    truncated: total > links.length,
  }
}
