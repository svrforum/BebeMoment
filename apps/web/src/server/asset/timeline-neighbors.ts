import { buildTimelineGroups } from '@/server/timeline/build-groups'
import { type TimelineSort, listTimeline } from '@/server/timeline/merged-list'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

/**
 * 타임라인 화면과 **같은 순서**의 자산 id 목록.
 *
 * 왜 페이지 크기까지 맞추나: 하루 안의 순서는 `applyStoryOrder` 가 정하는데, 그 함수는
 * **한 페이지 안에서만** 재배치한다(스토리 묶음을 그 페이지에 있는 첫 사진 자리에 통째로
 * 낸다). 그래서 500건을 한 번에 받아 정렬하면 화면이 100 + 60 + 60… 으로 나눠 받아
 * 이어붙인 순서와 경계에서 어긋난다. 화면이 부르는 그대로 페이지를 나눠 받고, 페이지마다
 * 화면과 같은 변환을 태운 뒤 이어붙인다 — 클라이언트의 mergeGroups 가 같은 날 버킷의
 * 꼬리에 덧붙이므로, 평평하게 편 순서는 이 이어붙이기와 같다.
 *
 * 대상 자산을 찾고 그 **뒤 한 장까지** 확보되면 멈춘다 — 이웃을 정하는 데 그 이상은
 * 필요 없다. 상한까지 못 찾으면 undefined 를 돌려 전역(시간순) 이웃에 맡긴다.
 */
export const TIMELINE_PAGE_SIZES = { first: 100, next: 60 } as const
/** 이 이상 파고들지 않는다. 넘어가면 전역 이웃으로 맡긴다(스와이프가 죽는 것보다 낫다). */
export const TIMELINE_MAX_ITEMS = 2000

export async function timelineNeighborIds(
  args: {
    assetId: string
    familyId: string
    viewerRole: Role
    sort: TimelineSort
    /** 'YYYY-MM-DD' — 날짜 필터 화면에서 열렸으면 그 날로 스코프. */
    date?: string
  },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
  opts?: { pageSizes?: { first: number; next: number }; maxItems?: number },
): Promise<string[] | undefined> {
  const pageSizes = opts?.pageSizes ?? TIMELINE_PAGE_SIZES
  const maxItems = opts?.maxItems ?? TIMELINE_MAX_ITEMS

  const ids: string[] = []
  let cursor: string | undefined
  let page = 0

  while (ids.length < maxItems) {
    const { items, nextCursor } = await listTimeline(
      args.familyId,
      {
        limit: page === 0 ? pageSizes.first : pageSizes.next,
        viewerRole: args.viewerRole,
        sort: args.sort,
        signUrls: false,
        ...(args.date ? { date: args.date } : {}),
        ...(cursor ? { cursor } : {}),
      },
      prismaPublic,
      prismaMedia,
      media,
    )
    for (const group of buildTimelineGroups({
      items,
      birthDate: null,
      sortMode: args.sort,
      includeStories: false,
    })) {
      for (const a of group.assets) {
        // 실패한 자산은 그리드에서 열 수 없다(카드가 링크 대신 재시도·삭제를 준다).
        // 이웃에 끼우면 스와이프가 열 수 없는 화면으로 데려가 막다른 길이 된다.
        if (a.status === 'ready') ids.push(a.id)
      }
    }
    page++

    const i = ids.indexOf(args.assetId)
    if (i >= 0 && i < ids.length - 1) return ids
    if (!nextCursor) return i >= 0 ? ids : undefined
    cursor = nextCursor
  }
  return undefined
}
