import { MonthGrid } from '@/components/calendar/month-grid'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadCalendarMonth } from '@/server/calendar/month'
import { getContext } from '@/server/context'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const ctx = await getContext()
  if (!ctx.family) return null

  // 보이는 달만 조달한다(전역 take:500 → 월 범위). MonthGrid 는 달 이동 시
  // /api/calendar 로 해당 달을 다시 가져온다 — 오래된 사진이 누락되지 않는다.
  // 월은 URL(?month=YYYY-MM)에서 읽는다 — 날짜를 눌러 타임라인으로 갔다가 돌아와도
  // 보던 달이 유지된다(예전엔 항상 현재월로 리셋됐다). MonthGrid 가 이동 시 URL 동기화.
  const { month: monthParam } = await searchParams
  const now = new Date()
  const m = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null
  const year = m ? Number(m.slice(0, 4)) : now.getUTCFullYear()
  const month = m ? Number(m.slice(5, 7)) - 1 : now.getUTCMonth()
  const { assets, storyDays } = await loadCalendarMonth(
    { familyId: ctx.family.id, year, month, viewerRole: ctx.membership?.role ?? 'family' },
    prismaMedia,
    prismaPublic,
    getMediaClient(),
  )

  return (
    <>
      <PullToRefresh />
      <AppHeader title="캘린더" />
      <div className="section-enter">
        <MonthGrid initialYear={year} initialMonth={month} storyDays={storyDays} assets={assets} />
      </div>
    </>
  )
}
