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

  // 보이는 달만 조달한다(전역 take:500 → 월 범위). 월은 URL(?month=YYYY-MM)에서 읽는다 —
  // MonthGrid 의 prev/next/picker 가 router.push 로 ?month 만 바꾸면 서버가 그 달을 다시
  // SSR 한다(헤더+데이터가 항상 같은 SSR 달). 날짜를 눌러 타임라인으로 갔다 돌아와도 그
  // 달이 유지되고, 캐시된 셸이 오면 MonthGrid 가 router.refresh 로 자가복구.
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
