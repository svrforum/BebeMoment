import { MonthGrid } from '@/components/calendar/month-grid'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadCalendarMonth } from '@/server/calendar/month'
import { getContext } from '@/server/context'

export default async function CalendarPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  // 보이는 달만 조달한다(전역 take:500 → 월 범위). MonthGrid 는 달 이동 시
  // /api/calendar 로 해당 달을 다시 가져온다 — 오래된 사진이 누락되지 않는다.
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
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
