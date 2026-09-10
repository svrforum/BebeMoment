import { logger } from '@/lib/logger'
import { listAlbumAssets } from '@/server/album/list-assets'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { listMemories } from '@/server/memories/list'
import { getPersonAssets } from '@/server/people/list'
import { getStoryEntry } from '@/server/story/get'
import { buildTimelineGroups } from '@/server/timeline/build-groups'
import { type TimelineSort, listTimeline } from '@/server/timeline/merged-list'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

export type ViewerContext = {
  familyId: string
  userId: string
  viewerRole: Role
  /** 타임라인 정렬 모드 — 'timeline' ctx 의 순서를 화면과 맞추는 데 쓴다. */
  sort?: TimelineSort
}

/** 타임라인 ctx 가 이웃으로 삼는 최근 항목 수. 이 창 밖에서 연 사진은
 *  loadViewerBundle 이 전역(시간순) 이웃으로 폴백한다. */
export const TIMELINE_NEIGHBOR_WINDOW = 500

/**
 * 상세 뷰어가 "어느 컬렉션에서 열렸는지"(ctx)에 따라, 그 컬렉션의 표시 순서대로의 자산
 * UUID 목록을 돌려준다. 뷰어는 이 목록 안에서 prev/next 를 찾아 컬렉션을 벗어나지 않는다.
 * ctx 형식: 'memories' | 'saved' | 'album:<albumId>' | 'person:<personId>' | 'story:<entryId>'
 * | 'timeline' | 'timeline:<YYYY-MM-DD>'. 알 수 없으면 undefined → 전역(시간순) 이웃.
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
  if (!ctx) return undefined
  const [kind, id] = ctx.split(':')
  const LIMIT = 500
  try {
    if (kind === 'timeline') {
      // 그리드는 시간순으로 뽑은 뒤 스토리 사진을 사용자가 담은 순서로 되돌린다
      // (merged-list 의 applyStoryOrder + group-by-day). 뷰어가 시간순만 보고 걸으면
      // 스토리 사진 구간에서 그리드와 정확히 반대 방향으로 넘어간다. 화면이 쓰는
      // 변환을 그대로 써서 같은 순서를 얻는다.
      const { items } = await listTimeline(
        v.familyId,
        {
          limit: TIMELINE_NEIGHBOR_WINDOW,
          viewerRole: v.viewerRole,
          sort: v.sort ?? 'taken',
          signUrls: false,
          ...(id ? { date: id } : {}),
        },
        prismaPublic,
        prismaMedia,
        media,
      )
      return buildTimelineGroups({
        items,
        birthDate: null,
        sortMode: v.sort ?? 'taken',
        includeStories: false,
      }).flatMap((g) => g.assets.map((a) => a.id))
    }
    if (kind === 'memories') {
      // id 순서만 필요하다 — signed URL 은 받지 않는다.
      const groups = await listMemories(
        { familyId: v.familyId, today: new Date(), viewerRole: v.viewerRole, signLimit: 0 },
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
  } catch (e) {
    // 컬렉션 해석 실패는 전역 타임라인 이웃으로 폴백하되 흔적은 남긴다 — 조용히 삼키면
    // "스와이프가 앨범을 벗어난다"는 보고를 재현해야만 원인을 알 수 있다.
    logger.warn({ ctx, familyId: v.familyId, err: (e as Error).message }, 'viewer ctx fallback')
    return undefined
  }
  return undefined
}
