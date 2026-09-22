'use client'
import { cn } from '@/lib/cn'
import { upcomingSchedule } from '@/lib/schedule-upcoming'
import type { ScheduleEntryView } from '@/server/schedule/list'
import { Check, ChevronRight, ListChecks } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  /** 보고 있는 달의 회차 전부(SSR 페이로드 그대로). 추리는 일은 여기서 한다. */
  entries: ScheduleEntryView[]
  /** 사용자 벽시계 기준 오늘(`YYYY-MM-DD`). */
  todayKey: string
}

const MAX_ROWS = 5

/** 분(0-1439)을 그 로케일의 시각으로. 날짜는 고정값이라 UTC 로 읽는다. */
function timeLabel(minute: number, locale: string): string {
  const at = new Date(Date.UTC(2000, 0, 1, Math.floor(minute / 60), minute % 60))
  return at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/**
 * 달력 아래 절반은 비어 있었고, 칸의 점 하나로는 "오늘 뭐가 있지" 에 답할 수 없었다.
 * 그 자리에 오늘부터 가까운 순서로 몇 건을 편다. 이 화면에는 클라이언트 페칭이 없다 —
 * 데이터는 월 그리드가 받은 SSR 페이로드 그대로다.
 */
export function UpcomingSchedule({ entries, todayKey }: Props) {
  const t = useTranslations('schedule')
  const locale = useLocale()
  const { kind, entries: rows } = upcomingSchedule(entries, todayKey, MAX_ROWS)

  return (
    <section className="mt-6 border-t border-base-200/70 pt-5 dark:border-base-800/70">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-base-500 dark:text-base-400">
          {t(kind === 'past' ? 'upcoming.pastTitle' : 'upcoming.title')}
        </h2>
        <Link
          href="/calendar/todo"
          prefetch={false}
          className="focus-ring -mr-1 flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-[13px] font-medium text-base-500 transition active:opacity-70 dark:text-base-400"
        >
          {t('upcoming.viewAll')}
          <ChevronRight size={15} aria-hidden />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-base-50 px-4 py-6 text-center text-[13px] text-base-400 dark:bg-base-800/40">
          {t('upcoming.empty')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((entry) => {
            const isToday = entry.onDate === todayKey
            const done = entry.doneAt !== null
            const when = [
              isToday
                ? t('upcoming.today')
                : new Date(`${entry.onDate}T00:00:00.000Z`).toLocaleDateString(locale, {
                    month: 'short',
                    day: 'numeric',
                    weekday: 'short',
                    timeZone: 'UTC',
                  }),
              entry.startMinute === null ? t('allDay') : timeLabel(entry.startMinute, locale),
            ].join(' · ')
            return (
              <li key={entry.id}>
                <Link
                  href={`/schedule/${entry.id}`}
                  prefetch={false}
                  className="focus-ring flex items-center gap-2.5 rounded-2xl bg-base-50 px-3 py-2.5 transition active:opacity-70 dark:bg-base-800/60"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[14px] font-medium text-base-900 dark:text-base-50',
                        done && 'text-base-400 line-through dark:text-base-500',
                      )}
                    >
                      {entry.title}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[12px] tabular-nums',
                        // 오늘 것이 이 목록의 존재 이유다 — 한눈에 구분되게.
                        isToday
                          ? 'font-semibold text-point-500'
                          : 'text-base-500 dark:text-base-400',
                      )}
                    >
                      {when}
                    </span>
                  </span>
                  {entry.checklistTotal > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-base-500 dark:text-base-400">
                      <ListChecks size={13} strokeWidth={2.2} aria-hidden />
                      {t('checklistProgress', {
                        done: entry.checklistDone,
                        total: entry.checklistTotal,
                      })}
                    </span>
                  )}
                  {done && (
                    <span
                      aria-label={t('done')}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-point-500"
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-base-300 dark:text-base-600"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
