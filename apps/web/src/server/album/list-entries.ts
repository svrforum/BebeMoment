import { GRID_URL_TIERS, toGridUrls } from '@/lib/asset-url'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'
import { isAlbumSecretForViewer } from './secret-visibility'

export type AlbumEntry = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
}

const DEFAULT_LIMIT = 200

/**
 * List diary entries (stories) attached to an album, hydrated with their
 * photos' signed URLs so the album view can render StoryCard. Preserves the
 * album's link order. family 역할에겐 비밀 앨범(또는 비밀 조상 아래 앨범)이 빈 앨범이다.
 */
export async function listAlbumEntries(
  args: { albumId: string; familyId: string; limit?: number; viewerRole: Role },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<AlbumEntry[]> {
  if (await isAlbumSecretForViewer(args, prismaPublic)) return []
  const links = await prismaPublic.albumStory.findMany({
    where: { albumId: args.albumId, familyId: args.familyId },
    orderBy: [{ sortIndex: 'asc' }, { addedAt: 'asc' }],
    take: args.limit ?? DEFAULT_LIMIT,
  })
  if (links.length === 0) return []

  const entries = await prismaPublic.story.findMany({
    where: {
      id: { in: links.map((l) => l.storyId) },
      familyId: args.familyId,
      deletedAt: null,
      // guardians-only entries hidden from the `family` role
      ...(args.viewerRole === 'family' ? { visibility: 'family' } : {}),
    },
    include: { assets: { orderBy: { order: 'asc' } } },
  })

  // 가족 공개 스토리라도 그 사진이 비밀 스토리에도 담겨 있으면 family 에겐 숨긴다 — 사진은
  // 어느 한 비밀 스토리에라도 속하면 모든 화면에서 빠지는 규칙이라, 여기서만 보이면 샌다.
  const hidden = new Set(
    await hiddenAssetIdsForViewer(args.viewerRole, prismaPublic, args.familyId),
  )
  const entryAssetIds = Array.from(
    new Set(entries.flatMap((e) => e.assets.map((a) => a.assetId))),
  ).filter((id) => !hidden.has(id))
  const entryAssets = entryAssetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: entryAssetIds }, familyId: args.familyId, deletedAt: null },
      })
    : []
  const assetById = new Map(entryAssets.map((a) => [a.id, a]))
  const readyIds = entryAssets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length
    ? await media.getAssetUrlsBatch(args.familyId, readyIds, { tiers: GRID_URL_TIERS })
    : {}

  const order = new Map(links.map((l, i) => [l.storyId, i]))
  return entries
    .map<AlbumEntry>((e) => ({
      ...e,
      assets: e.assets.map((ea) => {
        const base = assetById.get(ea.assetId) ?? null
        const withUrls: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? toGridUrls(urlsMap[base.id]) : null }
          : null
        return { ...ea, asset: withUrls }
      }),
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}
