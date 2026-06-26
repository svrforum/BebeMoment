import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type {
  Baby,
  StoryBookmark,
  Story,
  StoryAsset,
  PrismaClient as PrismaPublic,
} from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'
import { decodeCursor, encodeCursor } from '../cursor'
import { hiddenAssetIdsForViewer } from '../story/secret-assets'

type Cursor = { ts: string; entryId: string }
const isCursor = (c: Record<string, unknown>): c is Cursor =>
  typeof c.ts === 'string' && typeof c.entryId === 'string'

export type BookmarkedStoryEntry = StoryBookmark & {
  entry:
    | (Story & {
        assets: (StoryAsset & { asset: AssetWithUrls | null })[]
        baby: Baby | null
      })
    | null
}

export async function listMyStoryBookmarks(
  familyId: string,
  userId: string,
  viewerRole: 'owner' | 'guardian' | 'family',
  params: { cursor?: string; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<{ items: BookmarkedStoryEntry[]; nextCursor: string | null }> {
  const limit = params.limit ?? 30
  const cur = params.cursor ? decodeCursor(params.cursor, isCursor) : null
  const cursorTs = cur ? new Date(cur.ts) : null

  const items = await prismaPublic.storyBookmark.findMany({
    where: {
      familyId,
      userId,
      ...(cursorTs
        ? {
            OR: [
              { createdAt: { lt: cursorTs } },
              { createdAt: cursorTs, entryId: { lt: cur!.entryId } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { entryId: 'desc' }],
    take: limit + 1,
  })

  const hasMore = items.length > limit
  const page = items.slice(0, limit)

  const entryIds = page.map((b) => b.entryId)
  const entries = entryIds.length
    ? await prismaPublic.story.findMany({
        where: {
          id: { in: entryIds },
          familyId,
          deletedAt: null,
          // family-role viewers cannot see guardians-only entries
          ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
        },
        include: { assets: true, baby: true },
      })
    : []
  const byId = new Map(entries.map((e) => [e.id, e]))

  // family 가 보는 (가족 공개) 스토리라도, 그 사진이 비밀 스토리에도 속해 있으면 제외
  // (Rule A — story/get.ts 와 동일하게 저장 surface 에서도 비밀 사진 바이트를 가린다).
  const hidden = new Set(await hiddenAssetIdsForViewer(viewerRole, prismaPublic, familyId))

  // gather all asset ids across all entries for one batched fetch
  const allAssetIds = entries.flatMap((e) =>
    e.assets.map((a) => a.assetId).filter((id) => !hidden.has(id)),
  )
  const uniqueAssetIds = Array.from(new Set(allAssetIds))
  const assets = uniqueAssetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: uniqueAssetIds }, familyId, deletedAt: null },
      })
    : []
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  const joined: BookmarkedStoryEntry[] = page.map((b) => {
    const entry = byId.get(b.entryId) ?? null
    if (!entry) return { ...b, entry: null }
    const withAssets = entry.assets
      .filter((ea) => !hidden.has(ea.assetId))
      .map((ea) => {
        const base = assetById.get(ea.assetId) ?? null
        const withUrls: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
          : null
        return { ...ea, asset: withUrls }
      })
    return { ...b, entry: { ...entry, assets: withAssets } }
  })

  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ ts: last.createdAt.toISOString(), entryId: last.entryId })
      : null
  return { items: joined, nextCursor }
}
