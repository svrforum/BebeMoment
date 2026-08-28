import { pickDisplayUrl } from '@/lib/asset-url'
import { listMemories } from '@/server/memories/list'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import { bucketLabel } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { listWidgetPhotos } from './collection'

export type WidgetData = {
  hasPhoto: boolean
  photoUrl: string | null
  photoUrls: string[]
  /** photoUrls 와 같은 순서의 촬영일(YYYY-MM-DD, takenAt UTC 일자). 위젯이 현재
   *  보여주는 사진의 날짜를 표시하는 데 쓴다. */
  photoDates: string[]
  babyName: string | null
  birthDate: string | null
  newCount: number
  /** "생후 213일" 같은 나이 라벨. 날짜 계산·버킷 규칙이 앱과 갈라지지 않게 서버가 만든다. */
  ageText: string | null
  /** 오늘의 추억 사진 — 네이티브가 네트워크 없이 스타일을 전환할 수 있게 미리 내려준다.
   *  비어 있으면 위젯은 '추억' 스타일을 순환에서 건너뛴다. */
  memoryUrls: string[]
  memoryLabel: string | null
}

// 위젯이 받아갈 최신 사진 풀. 그리드 위젯은 앞 4장만, 단일 위젯은 새로고침(랜덤)
// 버튼이 이 풀에서 무작위로 한 장을 고른다.
const WIDGET_PHOTO_POOL = 10

/**
 * 위젯 데이터 — 사용자의 현재 가족 최신 사진들(display URL, 최대 4장) + 가장 먼저
 * 태어난 아기의 이름·생일 + 마지막으로 본 시점 이후 새 사진 수(뱃지용). 멤버십이
 * 없으면 null. 서명 URL TTL 10분이라 위젯은 받은 즉시 다운로드해야 한다.
 */
export async function getWidgetData(
  userId: string,
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
  config?: { source?: string | null },
): Promise<WidgetData | null> {
  const membership = await prismaPublic.membership.findFirst({
    where: { userId, deletedAt: null },
    select: { familyId: true, lastSeenAt: true, role: true },
  })
  if (!membership) return null
  const familyId = membership.familyId

  // family 위젯에는 비밀 스토리 사진을 노출하지 않는다(최근사진·북마크·새사진 수 모두).
  const hidden = await hiddenAssetIdsForViewer(membership.role, prismaPublic, familyId)
  const hiddenSet = new Set(hidden)
  // baseWhere 에 직접 넣으면 북마크 쿼리의 `id: { in: order }` 와 충돌하므로(같은 `id`
  // 키), 비밀 제외는 쿼리별로 적용한다(open 쿼리는 notIn, in-list 는 JS 필터).
  const notHidden = hidden.length ? { id: { notIn: hidden } } : {}

  const baseWhere = {
    familyId,
    status: 'ready' as const,
    deletedAt: null,
    duplicateOf: null,
  }

  const source = config?.source ?? 'recent'

  const selectRecent = () =>
    prismaMedia.asset.findMany({
      where: { ...baseWhere, ...notHidden },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      take: WIDGET_PHOTO_POOL,
      select: { id: true, takenAt: true },
    })

  // 주어진 순서(public 쪽에서 정한)를 유지한 채 media 에서 ready 자산만 추린다.
  const selectInOrder = async (ids: string[]): Promise<{ id: string; takenAt: Date }[]> => {
    const order = ids.filter((id) => !hiddenSet.has(id))
    if (order.length === 0) return []
    const rows = await prismaMedia.asset.findMany({
      where: { id: { in: order }, ...baseWhere },
      select: { id: true, takenAt: true },
    })
    const byId = new Map(rows.map((a) => [a.id, a]))
    return order
      .map((id) => byId.get(id))
      .filter((a): a is { id: string; takenAt: Date } => Boolean(a))
      .slice(0, WIDGET_PHOTO_POOL)
  }

  const selectBookmarks = async (): Promise<{ id: string; takenAt: Date }[]> => {
    const bms = await prismaPublic.assetBookmark.findMany({
      where: { familyId, userId },
      orderBy: { createdAt: 'desc' },
      select: { assetId: true },
      take: 100,
    })
    return selectInOrder(bms.map((b) => b.assetId))
  }

  // 사용자가 위젯에 직접 담은 사진들. 담은 순서(sortOrder)를 그대로 유지한다.
  const selectCollection = async (): Promise<{ id: string; takenAt: Date }[]> =>
    selectInOrder(await listWidgetPhotos({ familyId, userId }, prismaPublic))

  const selectBySource = () => {
    if (source === 'collection') return selectCollection()
    if (source === 'bookmark_random') return selectBookmarks()
    return selectRecent()
  }

  const [assetsRaw, baby, newCount] = await Promise.all([
    selectBySource(),
    prismaPublic.baby.findFirst({
      where: { familyId, deletedAt: null },
      orderBy: { birthDate: 'asc' },
      select: { name: true, birthDate: true },
    }),
    membership.lastSeenAt
      ? prismaMedia.asset.count({
          where: { ...baseWhere, ...notHidden, createdAt: { gt: membership.lastSeenAt } },
        })
      : Promise.resolve(0),
  ])
  // 북마크·컬렉션 소스인데 결과가 비면(담은 게 0·전부 삭제 등) 전체 최신으로 폴백 — 빈 위젯 방지.
  const assets = assetsRaw.length > 0 || source === 'recent' ? assetsRaw : await selectRecent()

  const ids = assets.map((a) => a.id)
  const urlsMap = ids.length ? await media.getAssetUrlsBatch(familyId, ids) : {}
  // url·date 를 같은 순서로 — url 없는 자산은 함께 걸러 인덱스 정합을 유지한다.
  const photos = assets
    .map((a) => ({ url: pickDisplayUrl(urlsMap[a.id] ?? null), date: a.takenAt }))
    .filter((p): p is { url: string; date: Date } => Boolean(p.url))
  const photoUrls = photos.map((p) => p.url)
  const photoDates = photos.map((p) => p.date.toISOString().slice(0, 10))

  // 추억은 소스와 무관하게 항상 실어 보낸다 — 네이티브가 스타일을 바꿀 때 네트워크를
  // 타지 않고 캐시에서 즉시 그릴 수 있어야 한다. 가장 먼 간격("1년 전 오늘")이 앞에 온다.
  const memoryGroups = await listMemories(
    { familyId, today: new Date(), viewerRole: membership.role },
    prismaMedia,
    prismaPublic,
    media,
  )
  const memoryGroup = memoryGroups.find((g) => g.assets.some((a) => pickDisplayUrl(a.urls)))
  const memoryUrls = (memoryGroup?.assets ?? [])
    .map((a) => pickDisplayUrl(a.urls))
    .filter((u): u is string => Boolean(u))
    .slice(0, WIDGET_PHOTO_POOL)

  return {
    hasPhoto: photoUrls.length > 0,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    photoDates,
    babyName: baby?.name ?? null,
    birthDate: baby ? baby.birthDate.toISOString().slice(0, 10) : null,
    newCount,
    ageText: baby ? bucketLabel(baby.birthDate, new Date()) : null,
    memoryUrls,
    memoryLabel: memoryUrls.length ? (memoryGroup?.label ?? null) : null,
  }
}
