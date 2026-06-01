import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

export type CalendarAsset = { id: string; takenAtISO: string; urls: AssetUrls | null }
export type CalendarMonth = { assets: CalendarAsset[]; storyDays: string[] }

const dayKeyOf = (d: Date): string => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`

/**
 * 한 달치 캘린더 데이터(날짜별 커버 1장 + 스토리 뱃지 일자)를 조달한다. takenAt 범위로
 * 스코프해 — 전역 take:500 으로 오래된 사진이 조용히 누락되던 문제 해결(가족이 사진을
 * 많이 쌓아도 보이는 달은 항상 완전). 커버 signed URL 도 그 달의 날짜 수로만 fan-out.
 * year/month 는 UTC 0-based month.
 */
export async function loadCalendarMonth(
  args: { familyId: string; year: number; month: number; viewerRole: Role },
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<CalendarMonth> {
  const { familyId, year, month, viewerRole } = args
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 1))

  const rawAssets = await prismaMedia.asset.findMany({
    where: {
      familyId,
      status: 'ready',
      deletedAt: null,
      takenAt: { gte: start, lt: end },
    },
    orderBy: { takenAt: 'desc' },
    select: { id: true, takenAt: true },
  })

  // 날짜별 커버 1장(최신순 첫 사진)만 signed URL.
  const seen = new Set<string>()
  const coverIds: string[] = []
  for (const a of rawAssets) {
    const key = dayKeyOf(a.takenAt)
    if (seen.has(key)) continue
    seen.add(key)
    coverIds.push(a.id)
  }
  const urlsMap = coverIds.length ? await media.getAssetUrlsBatch(familyId, coverIds) : {}

  // 모델 B — 그 달 사진 중 (보이는) 스토리에 속한 게 있으면 해당 일자에 스토리 뱃지.
  const storyDayKeys = new Set<string>()
  const allIds = rawAssets.map((a) => a.id)
  if (allIds.length) {
    const links = await prismaPublic.storyAsset.findMany({
      where: { assetId: { in: allIds } },
      select: { entryId: true, assetId: true },
    })
    if (links.length) {
      const entryIds = Array.from(new Set(links.map((l) => l.entryId)))
      const visible = await prismaPublic.story.findMany({
        where: {
          id: { in: entryIds },
          familyId,
          deletedAt: null,
          ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
        },
        select: { id: true },
      })
      const visibleIds = new Set(visible.map((s) => s.id))
      const takenById = new Map(rawAssets.map((a) => [a.id, a.takenAt]))
      for (const l of links) {
        if (!visibleIds.has(l.entryId)) continue
        const d = takenById.get(l.assetId)
        if (d) storyDayKeys.add(dayKeyOf(d))
      }
    }
  }

  return {
    assets: rawAssets.map((a) => ({
      id: a.id,
      takenAtISO: a.takenAt.toISOString(),
      urls: urlsMap[a.id] ?? null,
    })),
    storyDays: Array.from(storyDayKeys),
  }
}
