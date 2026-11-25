import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import {
  type ScheduleDaySummary,
  type ScheduleEntryView,
  listScheduleMonth,
} from '@/server/schedule/list'
import { GRID_URL_TIERS, type GridAssetUrls, toGridUrls } from '@/lib/asset-url'
import { DAY_SHEET_THUMBS } from '@/lib/day-sheet'
import type { MediaClient } from '@bebe/media-client'

export type CalendarAsset = { id: string; takenAtISO: string; urls: GridAssetUrls | null }
export type CalendarMonth = {
  assets: CalendarAsset[]
  storyDays: string[]
  scheduleDays: ScheduleDaySummary[]
  scheduleEntries: ScheduleEntryView[]
}

const dayKeyOf = (d: Date): string => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`

/**
 * 한 달치 캘린더 데이터(그 달 사진 + 스토리 뱃지 일자 + 그 달 일정)를 조달한다. takenAt 범위로
 * 스코프해 — 전역 take:500 으로 오래된 사진이 조용히 누락되던 문제 해결(가족이 사진을
 * 많이 쌓아도 보이는 달은 항상 완전). signed URL 은 날짜마다 시트가 그리는 장수까지만.
 * year/month 는 UTC 0-based month.
 */
export async function loadCalendarMonth(
  args: { familyId: string; year: number; month: number; viewerRole: Role; schedule: boolean },
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<CalendarMonth> {
  const { familyId, year, month, viewerRole } = args
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 1))

  // 일정은 이 SSR 페이로드에 함께 싣는다 — 이 화면에는 클라이언트 데이터 페칭이 없다.
  // 기능이 꺼져 있으면 조회조차 하지 않는다(기능 플래그는 UI 와 서버 양쪽에서 막는다).
  const schedule = args.schedule
    ? await listScheduleMonth({ familyId, year, month }, prismaPublic)
    : { days: [], entries: [] }

  // 비밀 스토리(guardians) 사진은 family 에게 커버·뱃지 모두에서 숨긴다.
  const hidden = await hiddenAssetIdsForViewer(viewerRole, prismaPublic, familyId)

  const rawAssets = await prismaMedia.asset.findMany({
    where: {
      familyId,
      status: 'ready',
      deletedAt: null,
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
      // 중복 별칭은 제외 — 타임라인(merged-list)과 동일. 안 빼면 스토리·앨범에 추가한
      // "이미 있는 사진"(별칭)이 캘린더 커버로 떠, 그 날짜 타임라인엔 없는데 사진이 있는
      // 것처럼 보였다.
      duplicateOf: null,
      takenAt: { gte: start, lt: end },
    },
    orderBy: { takenAt: 'desc' },
    select: { id: true, takenAt: true },
  })

  // 날짜마다 최신순 앞의 몇 장만 signed URL — 첫 장은 날짜 칸의 커버, 나머지는 날짜 시트.
  const perDay = new Map<string, number>()
  const signIds: string[] = []
  for (const a of rawAssets) {
    const key = dayKeyOf(a.takenAt)
    const n = perDay.get(key) ?? 0
    if (n >= DAY_SHEET_THUMBS) continue
    perDay.set(key, n + 1)
    signIds.push(a.id)
  }
  const urlsMap = signIds.length
    ? await media.getAssetUrlsBatch(familyId, signIds, { tiers: GRID_URL_TIERS })
    : {}

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
      urls: toGridUrls(urlsMap[a.id]),
    })),
    storyDays: Array.from(storyDayKeys),
    scheduleDays: schedule.days,
    scheduleEntries: schedule.entries,
  }
}
