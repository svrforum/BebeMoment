'use client'
import { CalendarTabs } from '@/components/calendar/calendar-tabs'
import { UpcomingSchedule } from '@/components/calendar/upcoming-schedule'
import { DaySheet } from '@/components/schedule/day-sheet'
import { useScheduleForm } from '@/components/schedule/entry-form-sheet'
import { cn } from '@/lib/cn'
import { localDayKey } from '@/lib/day-key'
import { useFamilySSE } from '@/lib/sse'
import type { ScheduleDaySummary, ScheduleEntryView } from '@/server/schedule/list'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DayCell } from './day-cell'

type Asset = { id: string; takenAtISO: string; urls: AssetUrls | null }

// 0..11 — picker 의 월 버튼 키로 인덱스 대신 값을 쓰기 위한 상수 배열.
const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

type Props = {
  initialYear: number
  initialMonth: number
  assets: Asset[]
  /** 스토리가 있는 UTC 일자 키(`${y}-${m0}-${d}`, m0=0-based). 모델 B. */
  storyDays?: string[]
  /** 그 달 일정의 날짜별 요약. 키는 `YYYY-MM-DD` — storyDays 와 형식이 다르다. */
  scheduleDays?: ScheduleDaySummary[]
  /** 그 달 일정의 회차 목록(매년 반복은 그 해 날짜로 전개된 상태). */
  scheduleEntries?: ScheduleEntryView[]
  /** 기능 플래그가 꺼지면 탭·시트의 일정 영역까지 사라져야 한다(데이터만 비우면 껍데기가 남는다). */
  scheduleEnabled?: boolean
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

/** 사진 버킷 키(`${y}-${m0}-${d}`)와 일정 키(`YYYY-MM-DD`)는 형식이 다르다. */
function bucketKeyOf(day: string): string {
  return `${Number(day.slice(0, 4))}-${Number(day.slice(5, 7)) - 1}-${Number(day.slice(8, 10))}`
}

export function MonthGrid({
  initialYear,
  initialMonth,
  assets,
  storyDays = [],
  scheduleDays = [],
  scheduleEntries = [],
  scheduleEnabled = false,
}: Props) {
  const t = useTranslations('timeline')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()

  // 표시 월 = 서버가 ?month 로 SSR 한 그 달(initialYear/initialMonth). 클라이언트 월 state·
  // /api/calendar 캐시를 두지 않는다 — 헤더와 데이터가 항상 같은 달(SSR)이라 "헤더는 5월인데
  // 사진 없음" 같은 불일치가 원천 차단된다. 월 이동은 router.push 로 URL 만 바꾸면 서버가
  // 그 달을 다시 SSR.
  const year = initialYear
  const month = initialMonth

  // 자가복구: Next App Router 의 클라이언트 캐시가 searchParams 만 다른 내비게이션에서
  // 이전 페이지 셸(예: 6월)을 재사용할 수 있다. URL 의 ?month 가 SSR 한 달과 다르면
  // (= 캐시된 셸이 옴) 서버에서 올바른 달을 다시 받는다(router.refresh). 일치하면 아무 일도 안 함.
  useEffect(() => {
    const m = searchParams.get('month')
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return
    const uy = Number(m.slice(0, 4))
    const um = Number(m.slice(5, 7)) - 1
    if (uy !== initialYear || um !== initialMonth) router.refresh()
  }, [searchParams, initialYear, initialMonth, router])

  const go = useCallback(
    (y: number, m0: number) => {
      router.push(`/calendar?month=${y}-${String(m0 + 1).padStart(2, '0')}`)
    },
    [router],
  )

  const viewAssets = assets
  const storySet = useMemo(() => new Set(storyDays), [storyDays])
  const scheduleByDay = useMemo(() => new Map(scheduleDays.map((s) => [s.day, s])), [scheduleDays])
  const entriesByDay = useMemo(() => {
    const m = new Map<string, ScheduleEntryView[]>()
    for (const entry of scheduleEntries) {
      if (!entry.onDate) continue
      const list = m.get(entry.onDate) ?? []
      list.push(entry)
      m.set(entry.onDate, list)
    }
    return m
  }, [scheduleEntries])

  // 날짜 시트. 닫히는 애니메이션 동안 내용이 비지 않도록 날짜는 그대로 두고 open 만 내린다.
  const [sheetDay, setSheetDay] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openDay = useCallback((day: string) => {
    setSheetDay(day)
    setSheetOpen(true)
  }, [])

  // 날짜 시트의 '일정 추가'. 시트 두 개가 겹쳐 있으면 뒤 시트가 닫히며 배경의 클릭을
  // 막아 버리므로, 먼저 닫고 나가는 애니메이션이 끝난 뒤에 작성 시트를 연다.
  const scheduleForm = useScheduleForm()
  const addEntryOn = useCallback(
    (day: string) => {
      setSheetOpen(false)
      setTimeout(() => scheduleForm.openCreate(day), 380)
    },
    [scheduleForm],
  )
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

  const prev = () => (month === 0 ? go(year - 1, 11) : go(year, month - 1))
  const next = () => (month === 11 ? go(year + 1, 0) : go(year, month + 1))
  const jumpToday = () => go(today.getUTCFullYear(), today.getUTCMonth())

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
    setPickerOpen(false)
    go(pickerYear, m)
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const isCurrentView = year === today.getUTCFullYear() && month === today.getUTCMonth()

  return (
    // 스와이프 영역을 캘린더 전체(빈 공간 포함)로 — 그리드 아래 빈 화면에서도 달 전환되게
    // min-height 로 뷰포트를 채운다.
    <div
      // 캘린더 폭은 좁게 유지한다. 넓은 데스크톱 컨테이너(5xl/6xl)에서 7열 aspect-square
      // 셀이 거대해져 월 전체가 세로로 넘쳐 스크롤이 생겼다 — md:max-w-xl 로 셀 크기를
      // 묶어 한 화면에 들어오게 한다.
      className="mx-auto min-h-[68svh] max-w-md px-5 py-4 sm:max-w-lg md:max-w-xl"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {scheduleEnabled && (
        <div className="mb-4">
          <CalendarTabs current="month" />
        </div>
      )}
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
              · {t('calendar.photoCount', { count: monthAssets })}
            </span>
          )}
          {pickerOpen && (
            <>
              <button
                type="button"
                aria-label={t('calendar.close')}
                onClick={() => setPickerOpen(false)}
                className="fixed inset-0 z-30 cursor-default bg-transparent"
              />
              <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-2xl border border-base-200/70 bg-base-0 p-3 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={t('calendar.prevYear')}
                    onClick={() => setPickerYear((y) => y - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-[16px] font-bold tabular-nums text-base-900 dark:text-base-50">
                    {t('calendar.year', { year: pickerYear })}
                  </span>
                  <button
                    type="button"
                    aria-label={t('calendar.nextYear')}
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
                        {t('calendar.monthShort', { month: m + 1 })}
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
              {t('calendar.today')}
            </button>
          )}
          <button
            type="button"
            onClick={prev}
            aria-label={t('calendar.prevMonth')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={t('calendar.nextMonth')}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-base-400">
        {(
          [
            'calendar.dow0',
            'calendar.dow1',
            'calendar.dow2',
            'calendar.dow3',
            'calendar.dow4',
            'calendar.dow5',
            'calendar.dow6',
          ] as const
        ).map((k, i) => (
          <div key={k} className={cn(i === 0 && 'text-danger/70', i === 6 && 'text-point-500/70')}>
            {t(k)}
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
          const day = d.toISOString().slice(0, 10)
          const summary = scheduleByDay.get(day)
          return (
            <DayCell
              key={d.toISOString()}
              date={d}
              assets={dayAssets.map((a) => ({ id: a.id, urls: a.urls }))}
              isCurrentMonth={d.getUTCMonth() === month}
              isToday={isTodayCell}
              hasStory={storySet.has(key)}
              scheduleTotal={summary?.total ?? 0}
              scheduleRemaining={summary?.remaining ?? 0}
              onSelect={() => openDay(day)}
            />
          )
        })}
      </div>
      {scheduleEnabled && (
        <UpcomingSchedule entries={scheduleEntries} todayKey={localDayKey(today)} />
      )}
      <DaySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        day={sheetDay}
        assets={
          sheetDay
            ? (byDate.get(bucketKeyOf(sheetDay)) ?? []).map((a) => ({ id: a.id, urls: a.urls }))
            : []
        }
        entries={sheetDay ? (entriesByDay.get(sheetDay) ?? []) : []}
        showEntries={scheduleEnabled}
        onAddEntry={scheduleForm.canCreate ? addEntryOn : undefined}
      />
    </div>
  )
}
