import { pickDisplayUrl } from '@/lib/asset-url'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

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
): Promise<WidgetData | null> {
  const membership = await prismaPublic.membership.findFirst({
    where: { userId, deletedAt: null },
    select: { familyId: true, lastSeenAt: true },
  })
  if (!membership) return null
  const familyId = membership.familyId

  const baseWhere = {
    familyId,
    status: 'ready' as const,
    deletedAt: null,
    duplicateOf: null,
  }

  const [assets, baby, newCount] = await Promise.all([
    prismaMedia.asset.findMany({
      where: baseWhere,
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      take: WIDGET_PHOTO_POOL,
      select: { id: true, takenAt: true },
    }),
    prismaPublic.baby.findFirst({
      where: { familyId, deletedAt: null },
      orderBy: { birthDate: 'asc' },
      select: { name: true, birthDate: true },
    }),
    membership.lastSeenAt
      ? prismaMedia.asset.count({
          where: { ...baseWhere, createdAt: { gt: membership.lastSeenAt } },
        })
      : Promise.resolve(0),
  ])

  const ids = assets.map((a) => a.id)
  const urlsMap = ids.length ? await media.getAssetUrlsBatch(familyId, ids) : {}
  // url·date 를 같은 순서로 — url 없는 자산은 함께 걸러 인덱스 정합을 유지한다.
  const photos = assets
    .map((a) => ({ url: pickDisplayUrl(urlsMap[a.id] ?? null), date: a.takenAt }))
    .filter((p): p is { url: string; date: Date } => Boolean(p.url))
  const photoUrls = photos.map((p) => p.url)
  const photoDates = photos.map((p) => p.date.toISOString().slice(0, 10))

  return {
    hasPhoto: photoUrls.length > 0,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    photoDates,
    babyName: baby?.name ?? null,
    birthDate: baby ? baby.birthDate.toISOString().slice(0, 10) : null,
    newCount,
  }
}
