import { listAlbumAssets } from '@/server/album/list-assets'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { listMemories } from '@/server/memories/list'
import { getPersonAssets } from '@/server/people/list'
import { getStoryEntry } from '@/server/story/get'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

export type ViewerContext = {
  familyId: string
  userId: string
  viewerRole: Role
}

/**
 * 상세 뷰어가 "어느 컬렉션에서 열렸는지"(ctx)에 따라, 그 컬렉션의 표시 순서대로의 자산
 * UUID 목록을 돌려준다. 뷰어는 이 목록 안에서 prev/next 를 찾아 컬렉션을 벗어나지 않는다.
 * ctx 형식: 'memories' | 'saved' | 'album:<albumId>' | 'person:<personId>' | 'story:<entryId>'.
 * 알 수 없거나 'timeline' 이면 undefined → 전역 타임라인 이웃(기존 동작).
 *
 * 각 컬렉션의 기존 목록 함수를 재사용해 화면 순서와 정확히 일치시킨다(자산 ID만 추출).
 */
export async function resolveNeighborIds(
  ctx: string | undefined,
  v: ViewerContext,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<string[] | undefined> {
  if (!ctx || ctx === 'timeline') return undefined
  const [kind, id] = ctx.split(':')
  const LIMIT = 500
  try {
    if (kind === 'memories') {
      const groups = await listMemories(
        { familyId: v.familyId, today: new Date(), viewerRole: v.viewerRole },
        prismaMedia,
        prismaPublic,
        media,
      )
      return groups.flatMap((g) => g.assets.map((a) => a.id))
    }
    if (kind === 'saved') {
      const { items } = await listMyBookmarks(
        v.familyId,
        v.userId,
        { limit: LIMIT, viewerRole: v.viewerRole },
        prismaPublic,
        prismaMedia,
        media,
      )
      return items.map((i) => i.asset?.id).filter((x): x is string => Boolean(x))
    }
    if (kind === 'album' && id) {
      const { assets } = await listAlbumAssets(
        { albumId: id, familyId: v.familyId, limit: LIMIT, viewerRole: v.viewerRole },
        prismaPublic,
        prismaMedia,
        media,
      )
      return assets.map((a) => a.id)
    }
    if (kind === 'person' && id) {
      const { assets } = await getPersonAssets(
        { familyId: v.familyId, personId: id, viewerRole: v.viewerRole },
        prismaMedia,
        media,
        prismaPublic,
      )
      return assets.map((a) => a.id)
    }
    if (kind === 'story' && id) {
      const entry = await getStoryEntry(
        id,
        v.familyId,
        prismaPublic,
        prismaMedia,
        media,
        v.viewerRole,
      )
      return entry?.assets.map((ea) => ea.asset?.id).filter((x): x is string => Boolean(x))
    }
  } catch {
    return undefined
  }
  return undefined
}
