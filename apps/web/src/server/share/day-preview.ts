import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { applyStoryOrder } from '../timeline/story-order'
import { getDateAssetIds } from './date-assets'
import { type PhotoSetPreview, buildPhotoSetPreview } from './photo-set'
import { toAbsolute } from './public-story'

export type DayStory = {
  id: string
  publicNo: number
  title: string | null
  body: string
  /** 스토리에 담긴 순서. ready·미삭제 자산만. */
  assetIds: string[]
}

/**
 * 'YYYY-MM-DD' 그 날의 스토리 — 타임라인과 같은 기준으로 **그 날 찍은 사진을 담은** 스토리
 * (entryDate 가 아니라 사진의 takenAt 일자, 모델 B). 공개 라우트라 세션·familyId 컨텍스트가
 * 없어 raw 쿼리로 tenant 미들웨어를 우회한다. 가족 공개(family) 스토리만 — guardians 전용은
 * 링크를 연 사람에게 존재 자체를 알리지 않는다.
 */
export async function getDayStories(
  date: string,
  familyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<DayStory[]> {
  const dayIds = await getDateAssetIds(date, familyId, prismaMedia)
  if (dayIds.length === 0) return []

  const anchors = await prismaPublic.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT s.id, s.created_at
    FROM stories s JOIN story_assets sa ON sa.entry_id = s.id
    WHERE s.family_id = ${familyId}::uuid
      AND s.deleted_at IS NULL
      AND s.visibility = 'family'
      AND sa.asset_id = ANY(${dayIds}::uuid[])
    ORDER BY s.created_at ASC, s.id ASC
  `
  if (anchors.length === 0) return []
  const storyIds = anchors.map((r) => r.id)

  const rows = await prismaPublic.$queryRaw<
    { id: string; public_no: number; title: string | null; body: string }[]
  >`
    SELECT id, public_no, title, body FROM stories WHERE id = ANY(${storyIds}::uuid[])
  `
  const assetRows = await prismaPublic.$queryRaw<{ entry_id: string; asset_id: string }[]>`
    SELECT entry_id, asset_id FROM story_assets
    WHERE entry_id = ANY(${storyIds}::uuid[])
    ORDER BY entry_id, "order" ASC
  `
  const ready = new Set(
    (
      await prismaMedia.asset.findMany({
        where: {
          id: { in: assetRows.map((a) => a.asset_id) },
          familyId,
          status: 'ready',
          deletedAt: null,
        },
        select: { id: true },
      })
    ).map((a) => a.id),
  )
  const assetsByStory = new Map<string, string[]>()
  for (const a of assetRows) {
    if (!ready.has(a.asset_id)) continue
    const list = assetsByStory.get(a.entry_id) ?? []
    list.push(a.asset_id)
    assetsByStory.set(a.entry_id, list)
  }
  const byId = new Map(rows.map((r) => [r.id, r]))
  return storyIds.flatMap((id) => {
    const r = byId.get(id)
    return r
      ? [
          {
            id,
            publicNo: r.public_no,
            title: r.title,
            body: r.body,
            assetIds: assetsByStory.get(id) ?? [],
          },
        ]
      : []
  })
}

/** 그 날 사진(시간순)에 타임라인과 같은 규칙으로 스토리 배열 순서를 입힌다. */
export function orderDayAssetIds(assetIds: string[], stories: DayStory[]): string[] {
  const storyOf = new Map<string, { storyId: string; order: number }>()
  for (const s of stories) {
    s.assetIds.forEach((assetId, order) => {
      if (!storyOf.has(assetId)) storyOf.set(assetId, { storyId: s.id, order })
    })
  }
  return applyStoryOrder(
    assetIds.map((id) => ({ kind: 'asset' as const, id })),
    storyOf,
  ).map((it) => it.id)
}

export type DayStoryPreview = {
  id: string
  publicNo: number
  title: string | null
  body: string
  coverUrl: string | null
  /** 링크를 연 사람에게 보이는 그 스토리의 사진 수(대표 1장 + 잠긴 나머지). */
  totalPhotos: number
}

export type DayPreview = {
  stories: DayStoryPreview[]
  photos: PhotoSetPreview
  /** 그 날 사진 중 위 스토리 어디에도 안 담긴 것의 수 — 잠긴 타일로만 보여준다. */
  loosePhotos: number
  /** 스토리가 하나도 없을 때 대표로 쓸 첫 사진. */
  looseCoverUrl: string | null
}

/**
 * 날짜 공유의 공개 프리뷰 = 그 날 스토리(대표사진·제목·본문) + 그 날 사진 집합.
 * 해석 시점 기준(동적) — 링크를 만든 뒤 같은 날에 올린 사진·스토리도 포함된다.
 * 비밀 스토리 사진은 photos 에서 빠지고(buildPhotoSetPreview), 그래서 사진이 하나도 남지
 * 않은 스토리는 카드도 내지 않는다.
 */
export async function buildDayPreview(
  date: string,
  familyId: string,
  baseUrl: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<DayPreview | null> {
  const [dayIds, stories] = await Promise.all([
    getDateAssetIds(date, familyId, prismaMedia),
    getDayStories(date, familyId, prismaPublic, prismaMedia),
  ])
  const photos = await buildPhotoSetPreview(
    orderDayAssetIds(dayIds, stories),
    familyId,
    baseUrl,
    prismaPublic,
    prismaMedia,
    media,
  )
  if (!photos) return null

  const visible = new Set(photos.ids)
  const shown = stories
    .map((s) => ({ ...s, assetIds: s.assetIds.filter((id) => visible.has(id)) }))
    .filter((s) => s.assetIds.length > 0)
  const coverIds = shown.flatMap((s) => (s.assetIds[0] ? [s.assetIds[0]] : []))
  let urlsById: Record<string, Awaited<ReturnType<MediaClient['getAssetUrls']>>> = {}
  if (coverIds.length) {
    try {
      urlsById = await media.getAssetUrlsBatch(familyId, coverIds)
    } catch {
      urlsById = {}
    }
  }
  const inStory = new Set(shown.flatMap((s) => s.assetIds))
  const looseIds = photos.ids.filter((id) => !inStory.has(id))
  const firstLoose = looseIds[0]
  const looseIndex = firstLoose ? photos.ids.indexOf(firstLoose) : -1
  return {
    photos,
    stories: shown.map((s) => {
      const u = s.assetIds[0] ? urlsById[s.assetIds[0]] : undefined
      return {
        id: s.id,
        publicNo: s.publicNo,
        title: s.title,
        body: s.body,
        coverUrl: toAbsolute(u?.display1080?.jpeg ?? u?.videoPoster ?? null, baseUrl),
        totalPhotos: s.assetIds.length,
      }
    }),
    loosePhotos: looseIds.length,
    looseCoverUrl: looseIndex >= 0 ? (photos.items[looseIndex]?.displayUrl ?? null) : null,
  }
}
