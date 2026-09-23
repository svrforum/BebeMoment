import { clockParts } from '@/lib/clock'
import type { PublicSchedulePreview } from '@/server/share/public-schedule'
import { CalendarDays, Clock, Lock } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { ShareViewFrame, appDeepLink } from './share-frame'

/** 공개 메타와 화면이 같은 문구를 쓴다 — "2026년 9월 23일 수요일" / "오전 10:00"·"종일". */
export async function scheduleWhen(
  p: Pick<PublicSchedulePreview, 'onDate' | 'startMinute'>,
): Promise<{ day: string | null; time: string | null }> {
  if (!p.onDate) return { day: null, time: null }
  const locale = await getLocale()
  const t = await getTranslations('schedule')
  // 일정 날짜는 벽시계를 UTC 자정으로 저장한다 — UTC 로 읽어야 하루가 밀리지 않는다.
  const day = new Date(`${p.onDate}T00:00:00.000Z`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  })
  if (p.startMinute === null) return { day, time: t('allDay') }
  const { period, hour12, minute2 } = clockParts(p.startMinute)
  return { day, time: t(period === 'am' ? 'time.am' : 'time.pm', { time: `${hour12}:${minute2}` }) }
}

/**
 * 로그인 전 일정 공유 화면. 제목·날짜·시각만 보이고, 메모·체크리스트는 로그인한 보호자가
 * 일정 상세에서 본다 — 두 버튼 모두 그 상세로 간다(미로그인이면 로그인 뒤 돌아온다).
 */
export async function ScheduleShareView({ p, base }: { p: PublicSchedulePreview; base: string }) {
  const t = await getTranslations('share')
  const path = `/schedule/${p.entryId}`
  const webUrl = `${base}${path}`
  const { day, time } = await scheduleWhen(p)

  return (
    <ShareViewFrame
      familyName={p.familyName}
      meta={t('schedule.meta')}
      appHref={appDeepLink(base, path, webUrl)}
      webUrl={webUrl}
    >
      <section className="mt-6 rounded-2xl border border-base-200/70 bg-base-0 p-5 shadow-card dark:border-base-800/70 dark:bg-base-900">
        <h1 className="text-[22px] font-bold leading-snug tracking-tight text-base-900 dark:text-base-50">
          {p.title}
        </h1>
        {(day || time) && (
          <div className="mt-4 space-y-2 text-[15px] text-base-700 dark:text-base-200">
            {day && (
              <p className="flex items-center gap-2">
                <CalendarDays size={17} className="shrink-0 text-point-500" aria-hidden />
                {day}
              </p>
            )}
            {time && (
              <p className="flex items-center gap-2">
                <Clock size={17} className="shrink-0 text-point-500" aria-hidden />
                {time}
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-4 flex items-center gap-2 px-1 text-[13px] text-base-500">
        <Lock size={14} className="shrink-0" aria-hidden />
        {t('schedule.locked')}
      </p>
    </ShareViewFrame>
  )
}
