'use client'
import { cn } from '@/lib/cn'
import { useFamilySSE } from '@/lib/sse'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DayCell } from './day-cell'

type Asset = { id: string; takenAtISO: string; urls: AssetUrls | null }
type MonthData = { assets: Asset[]; storyDays: string[] }

// 0..11 — picker 의 월 버튼 키로 인덱스 대신 값을 쓰기 위한 상수 배열.
const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

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

  // 보이는 달만 서버에서 받는다(전역 take:500 제거). 초기 달은 SSR props 를 그대로 쓰고,
  // 다른 달로 이동하면 /api/calendar 로 받아 캐시. SSE 새로고침 시 캐시를 비워 재요청.
  const initialKey = `${initialYear}-${initialMonth}`
  const monthKey = `${year}-${month}`
  const [cache, setCache] = useState<Record<string, MonthData>>({})
  useEffect(() => {
    if (monthKey === initialKey || cache[monthKey]) return
    let cancelled = false
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then((r) => (r.ok ? (r.json() as Promise<MonthData>) : null))
      .then((d) => {
        if (d && !cancelled) setCache((prev) => ({ ...prev, [monthKey]: d }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [monthKey, initialKey, year, month, cache])

  const monthData: MonthData =
    monthKey === initialKey
      ? { assets, storyDays }
      : (cache[monthKey] ?? { assets: [], storyDays: [] })
  const viewAssets = monthData.assets
  const storySet = useMemo(() => new Set(monthData.storyDays), [monthData.storyDays])
  // 년·월 빠른 선택 picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(initialYear)
  // 좌우 스와이프(모바일)로 달 이동
  const touchStart = useRef<{ x: number; y: number } | null>(null)

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
        refreshTimer.current = setTimeout(() => {
          setCache({}) // 다른 달 캐시 무효화 → 현재 달 재요청. 초기 달은 router.refresh.
          router.refresh()
        }, 800)
      }
    },
    [router],
  )
  useFamilySSE(onEvent)

  const today = useMemo(() => new Date(), [])
  const days = daysInMonth(year, month)

  const byDate = useMemo(() => {
    const m = new Map<string, Asset[]>()
    for (const a of viewAssets) {
      const d = new Date(a.takenAtISO)
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      const list = m.get(key) ?? []
      list.push(a)
      m.set(key, list)
    }
    return m
  }, [viewAssets])

  const monthAssets = useMemo(
    () =>
      viewAssets.filter((a) => {
        const d = new Date(a.takenAtISO)
        return d.getUTCFullYear() === year && d.getUTCMonth() === month
      }).length,
    [viewAssets, year, month],
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

  // 좌우 스와이프 → 다음/이전 달. 가로 이동이 충분히 크고 세로보다 우세할 때만(셀 탭과 구분).
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current
    touchStart.current = null
    const t = e.changedTouches[0]
    if (!s || !t) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    if (dx < 0) next()
    else prev()
  }

  const openPicker = () => {
    setPickerYear(year)
    setPickerOpen((v) => !v)
  }
  const pickMonth = (m: number) => {
    setYear(pickerYear)
    setMonth(m)
    setPickerOpen(false)
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const isCurrentView = year === today.getUTCFullYear() && month === today.getUTCMonth()

  return (
    // 스와이프 영역을 캘린더 전체(빈 공간 포함)로 — 그리드 아래 빈 화면에서도 달 전환되게
    // min-height 로 뷰포트를 채운다.
    <div
      className="mx-auto min-h-[68svh] max-w-3xl px-5 py-4 lg:max-w-5xl xl:max-w-6xl"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="relative flex items-baseline gap-2">
          <button
            type="button"
            onClick={openPicker}
            aria-expanded={pickerOpen}
            className="focus-ring flex items-center gap-1 rounded-lg text-[22px] font-bold tracking-tight tabular-nums text-base-900 transition active:opacity-70 dark:text-base-50"
          >
            {monthLabel}
            <ChevronDown
              className={cn(
                'h-5 w-5 text-base-400 transition-transform',
                pickerOpen && 'rotate-180',
              )}
            />
          </button>
          {monthAssets > 0 && (
            <span className="text-[13px] font-medium tabular-nums text-base-400">
              · {monthAssets}장
            </span>
          )}
          {pickerOpen && (
            <>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setPickerOpen(false)}
                className="fixed inset-0 z-30 cursor-default bg-transparent"
              />
              <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-2xl border border-base-200/70 bg-base-0 p-3 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="이전 해"
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-[16px] font-bold tabular-nums text-base-900 dark:text-base-50">
                    {pickerYear}년
                  </span>
                  <button
                    type="button"
                    aria-label="다음 해"
                    onClick={() => setPickerYear((y) => y + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS.map((m) => {
                    const isSel = pickerYear === year && m === month
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => pickMonth(m)}
                        className={cn(
                          'rounded-xl py-2 text-[14px] font-medium tabular-nums transition active:scale-95',
                          isSel
                            ? 'bg-point-500 text-white'
                            : 'text-base-700 hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-800',
                        )}
                      >
                        {m + 1}월
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
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
