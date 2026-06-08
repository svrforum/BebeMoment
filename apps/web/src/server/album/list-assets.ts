import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

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
  args: { albumId: string; familyId: string; limit?: number; viewerRole?: Role },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<ListAlbumAssetsResult> {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  // family 에게는 비밀 스토리 사진을 앨범에서도 제외(앨범에 담긴 standalone 자산이라도).
  const hidden = await hiddenAssetIdsForViewer(
    args.viewerRole ?? 'family',
    prismaPublic,
    args.familyId,
  )
  const hiddenSet = new Set(hidden)

  const [links, rawTotal, hiddenInAlbum] = await Promise.all([
    prismaPublic.albumAsset.findMany({
      where: { albumId: args.albumId, familyId: args.familyId },
      orderBy: [{ sortIndex: 'asc' }, { addedAt: 'asc' }],
      take: limit,
    }),
    prismaPublic.albumAsset.count({
      where: { albumId: args.albumId, familyId: args.familyId },
    }),
    hiddenSet.size
      ? prismaPublic.albumAsset.count({
          where: { albumId: args.albumId, familyId: args.familyId, assetId: { in: hidden } },
        })
      : Promise.resolve(0),
  ])
  // family 가 보는 total 은 비밀 사진을 뺀 수(앨범 전체 기준) — "N장 중 N장" 정합.
  const total = rawTotal - hiddenInAlbum

  const visibleLinks = hiddenSet.size ? links.filter((l) => !hiddenSet.has(l.assetId)) : links
  if (visibleLinks.length === 0) {
    return { assets: [], total, truncated: false }
  }

  const assets = await prismaMedia.asset.findMany({
    where: {
      id: { in: visibleLinks.map((l) => l.assetId) },
      familyId: args.familyId,
      deletedAt: null,
    },
  })
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(args.familyId, readyIds) : {}

  return {
    assets: visibleLinks
      .map((l) => byId.get(l.assetId))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ ...a, urls: urlsMap[a.id] ?? null })),
    total,
    truncated: total > visibleLinks.length,
  }
}
