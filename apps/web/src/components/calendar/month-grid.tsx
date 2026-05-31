'use client'
import { cn } from '@/lib/cn'
import { useFamilySSE } from '@/lib/sse'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState } from 'react'
import { DayCell } from './day-cell'

type Asset = { id: string; takenAtISO: string; urls: AssetUrls | null }

type Props = {
  initialYear: number
  initialMonth: number
  assets: Asset[]
  /** 스토리가 있는 UTC 일자 키(`${y}-${m0}-${d}`, m0=0-based). 모델 B. */
  storyDays?: string[]
}

// 날짜는 전부 UTC 로 다룬다 — takenAt 은 촬영 벽시계 시각을 UTC 로 저장하므로,
// UTC 일자로 버킷팅해야 사진이 실제 찍힌 날 셀에 들어가고 타임라인 날짜 필터
// (?date=YYYY-MM-DD, 역시 UTC 일자)와 정확히 일치한다.
function daysInMonth(year: number, month: number): Date[] {
  const first = new Date(Date.UTC(year, month, 1))
  const startWeekday = first.getUTCDay()
  const days: Date[] = []
  for (let i = 0; i < startWeekday; i++) {
    days.push(new Date(Date.UTC(year, month, 1 - (startWeekday - i))))
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(Date.UTC(year, month, d)))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1] as Date
    days.push(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1)))
  }
  return days
}

export function MonthGrid({ initialYear, initialMonth, assets, storyDays = [] }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const router = useRouter()
  const storySet = useMemo(() => new Set(storyDays), [storyDays])

  // 업로드·삭제 등 자산 변화 시 캘린더도 새로고침(타임라인처럼) — 삭제한 사진이 남아
  // 보이던 문제 해결. 다중 이벤트 디바운스.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEvent = useCallback(
    (event: AssetEvent) => {
      if (
        event.type === 'asset.deleted' ||
        (event.type === 'asset.updated' && (event.status === 'ready' || event.status === 'failed'))
      ) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => router.refresh(), 800)
      }
    },
    [router],
  )
  useFamilySSE(onEvent)

  const today = useMemo(() => new Date(), [])
  const days = daysInMonth(year, month)

  const byDate = useMemo(() => {
    const m = new Map<string, Asset[]>()
    for (const a of assets) {
      const d = new Date(a.takenAtISO)
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
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
        return d.getUTCFullYear() === year && d.getUTCMonth() === month
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
    setYear(today.getUTCFullYear())
    setMonth(today.getUTCMonth())
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const isCurrentView = year === today.getUTCFullYear() && month === today.getUTCMonth()

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
              className="focus-ring rounded-full px-3 py-1.5 text-[12px] font-medium text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
            >
              오늘
            </button>
          )}
          <button
            type="button"
            onClick={prev}
            aria-label="이전 달"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="다음 달"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
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
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
          const dayAssets = byDate.get(key) ?? []
          const isTodayCell =
            d.getUTCFullYear() === today.getUTCFullYear() &&
            d.getUTCMonth() === today.getUTCMonth() &&
            d.getUTCDate() === today.getUTCDate()
          return (
            <DayCell
              key={d.toISOString()}
              date={d}
              assets={dayAssets.map((a) => ({ id: a.id, urls: a.urls }))}
              isCurrentMonth={d.getUTCMonth() === month}
              isToday={isTodayCell}
              hasStory={storySet.has(key)}
            />
          )
        })}
      </div>
    </div>
  )
}
