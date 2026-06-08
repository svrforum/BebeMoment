import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'

export type AlbumEntry = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
}

const DEFAULT_LIMIT = 200

/**
 * List diary entries (stories) attached to an album, hydrated with their
 * photos' signed URLs so the album view can render StoryCard. Preserves the
 * album's link order.
 */
export async function listAlbumEntries(
  args: {
    albumId: string
    familyId: string
    limit?: number
    viewerRole?: 'owner' | 'guardian' | 'family'
  },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<AlbumEntry[]> {
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
    include: { assets: true },
  })

  // family 에게는 비밀 스토리에도 속한 사진을 하이드레이션에서 제외(Rule A 일관).
  const hidden = new Set(
    await hiddenAssetIdsForViewer(args.viewerRole ?? 'family', prismaPublic, args.familyId),
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
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(args.familyId, readyIds) : {}

  const order = new Map(links.map((l, i) => [l.storyId, i]))
  return entries
    .map<AlbumEntry>((e) => ({
      ...e,
      assets: e.assets.map((ea) => {
        const base = assetById.get(ea.assetId) ?? null
        const withUrls: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
          : null
        return { ...ea, asset: withUrls }
      }),
    }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}
