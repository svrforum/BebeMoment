'use client'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DayCell } from './day-cell'

type Asset = { id: string; takenAtISO: string; urls: AssetUrls | null }

type Props = {
  initialYear: number
  initialMonth: number
  assets: Asset[]
}

function daysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const days: Date[] = []
  for (let i = 0; i < startWeekday; i++) {
    days.push(new Date(year, month, 1 - (startWeekday - i)))
  }
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1] as Date
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
  }
  return days
}

export function MonthGrid({ initialYear, initialMonth, assets }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  const today = useMemo(() => new Date(), [])
  const days = daysInMonth(year, month)

  const byDate = useMemo(() => {
    const m = new Map<string, Asset[]>()
    for (const a of assets) {
      const d = new Date(a.takenAtISO)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const list = m.get(key) ?? []
      list.push(a)
      m.set(key, list)
    }
    return m
  }, [assets])

  const monthAssets = useMemo(
    () =>
      assets.filter((a) => {
        const d = new Date(a.takenAtISO)
        return d.getFullYear() === year && d.getMonth() === month
      }).length,
    [assets, year, month],
  )

  const prev = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }
  const next = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }
  const jumpToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  })
  const isCurrentView = year === today.getFullYear() && month === today.getMonth()

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[22px] font-bold tracking-tight tabular-nums text-base-900 dark:text-base-50">
            {monthLabel}
          </h2>
          {monthAssets > 0 && (
            <span className="text-[13px] font-medium tabular-nums text-base-400">
              · {monthAssets}장
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentView && (
            <button
              type="button"
              onClick={jumpToday}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
            >
              오늘
            </button>
          )}
          <button
            type="button"
            onClick={prev}
            aria-label="이전 달"
            className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="다음 달"
            className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-base-400">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={cn(i === 0 && 'text-danger/70', i === 6 && 'text-point-500/70')}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          const dayAssets = byDate.get(key) ?? []
          const isTodayCell =
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          return (
            <DayCell
              key={d.toISOString()}
              date={d}
              assets={dayAssets.map((a) => ({ id: a.id, urls: a.urls }))}
              isCurrentMonth={d.getMonth() === month}
              isToday={isTodayCell}
            />
          )
        })}
      </div>
    </div>
  )
}
