import { CalendarTabs } from '@/components/calendar/calendar-tabs'
import { TodoList } from '@/components/schedule/todo-list'
import { AppHeader } from '@/components/shell/app-header'
import { localDayKey } from '@/lib/day-key'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { listScheduleTodos } from '@/server/schedule/list'
import { getFeatureFlags } from '@/server/settings/features'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

export default async function CalendarTodoPage() {
  const ctx = await getContext()
  if (!ctx.family) notFound()
  const features = await getFeatureFlags(prismaPublic)
  if (!features.schedule || !ctx.capabilities.includes('schedule.read')) notFound()

  const t = await getTranslations('timeline')
  // '오늘' 은 인스턴스 벽시계 기준이다 — 알림이 울리는 시간대와 같아야 지난 · 오늘이 맞는다.
  const todayKey = localDayKey()
  const groups = await listScheduleTodos({ familyId: ctx.family.id, todayKey }, prismaPublic)

  return (
    <>
      <AppHeader title={t('calendar.title')} />
      <div className="section-enter mx-auto min-h-[68svh] max-w-md px-5 py-4 sm:max-w-lg md:max-w-xl">
        <div className="mb-4">
          <CalendarTabs current="todo" />
        </div>
        <TodoList groups={groups} todayKey={todayKey} />
      </div>
    </>
  )
}
