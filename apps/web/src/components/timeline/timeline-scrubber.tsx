'use client'
import { cn } from '@/lib/cn'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLocale } from 'next-intl'
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DAY_SECTION_ATTR, appHeaderBottom, daySectionAt } from './day-sections'
import { AT_TOP_SCROLL_PX } from './live-refresh'
import { type ScrubDay, dayIndexAt, fractionOfDay, monthTicks } from './scrubber-math'

const HIDE_AFTER_MS = 1500
const HANDLE_H = 48
const TICK_MIN_GAP_PX = 22
/** 손잡이·말풍선과 겹치는 눈금은 숨긴다(손잡이 중심에서 이 거리 안). */
const TICK_CLEAR_PX = 34

/** 화면 맨 위에 걸린 날짜 섹션의 순번과 그 섹션을 얼마나 지나왔는지(0~1). */
function readCurrentDay(): { key: string; progress: number } | null {
  // 점프는 섹션을 헤더 8px 아래에 세운다 — 그 위 섹션의 아랫변이 기준선에 걸리지 않게 여유를 둔다.
  const line = appHeaderBottom() + 12
  const el = daySectionAt(line)
  const key = el?.getAttribute(DAY_SECTION_ATTR)
  if (!el || !key) return null
  const r = el.getBoundingClientRect()
  const progress = r.height > 0 ? Math.min(1, Math.max(0, (line - r.top) / r.height)) : 0
  return { key, progress }
}

type Props = {
  /** 사진이 있는 날, 최신순. */
  days: ScrubDay[]
  /** 손을 뗀 날로 이동. 아직 안 불러온 날이면 불러온 뒤 resolve. */
  onJump: (dayKey: string) => Promise<void>
}

/**
 * 타임라인 오른쪽 날짜 손잡이. 스크롤하면 나타나 지금 달을 알려 주고, 끌면 날짜 말풍선과
 * 달 눈금을 보여 주다가 손을 뗀 날로 간다. 키보드·스크린리더는 일반 스크롤과 날짜 제목(h2)이
 * 그대로라 보조 장치로 숨긴다.
 */
export function TimelineScrubber({ days, onJump }: Props) {
  const locale = useLocale()
  const indexByKey = useMemo(() => new Map(days.map((d, i) => [d.key, i])), [days])
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ index: number; progress: number } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [jumpingKey, setJumpingKey] = useState<string | null>(null)
  const [trackTop, setTrackTop] = useState(0)
  const [trackPx, setTrackPx] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef(false)
  holdRef.current = dragIndex !== null || jumpingKey !== null

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (!holdRef.current) setVisible(false)
    }, HIDE_AFTER_MS)
  }, [])

  useEffect(() => {
    if (days.length < 2) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const long = document.documentElement.scrollHeight > window.innerHeight * 3
        if (window.scrollY < AT_TOP_SCROLL_PX || !long) {
          if (!holdRef.current) setVisible(false)
          return
        }
        const cur = readCurrentDay()
        const index = cur ? indexByKey.get(cur.key) : undefined
        if (index !== undefined && cur) setPosition({ index, progress: cur.progress })
        setTrackTop(appHeaderBottom() + 24)
        setVisible(true)
        scheduleHide()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [days.length, indexByKey, scheduleHide])

  const indexAtPointer = (clientY: number): number => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.height <= 0) return 0
    return dayIndexAt((clientY - r.top) / r.height, days.length)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (jumpingKey) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setTrackPx(trackRef.current?.getBoundingClientRect().height ?? 0)
    setDragIndex(indexAtPointer(e.clientY))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragIndex === null) return
    setDragIndex(indexAtPointer(e.clientY))
  }
  const onPointerUp = () => {
    if (dragIndex === null) return
    const target = days[dragIndex]
    setDragIndex(null)
    if (!target) return
    setPosition({ index: dragIndex, progress: 0 })
    setJumpingKey(target.key)
    void onJump(target.key).finally(() => {
      setJumpingKey(null)
      scheduleHide()
    })
  }
  const onPointerCancel = () => {
    setDragIndex(null)
    scheduleHide()
  }

  const ticks = useMemo(
    () => (trackPx > 0 ? monthTicks(days, TICK_MIN_GAP_PX / trackPx) : []),
    [days, trackPx],
  )

  if (days.length < 2) return null

  const dragging = dragIndex !== null
  const shownIndex = dragIndex ?? position?.index ?? 0
  const fraction = dragging
    ? fractionOfDay(shownIndex, days.length)
    : Math.min(1, (shownIndex + (position?.progress ?? 0)) / days.length)
  const shownDay = days[shownIndex]
  const shownDate = shownDay ? new Date(`${shownDay.key}T00:00:00.000Z`) : null
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    shownDate ? shownDate.toLocaleDateString(locale, { ...opts, timeZone: 'UTC' }) : ''
  const monthLabel = (month: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString(locale, { ...opts, timeZone: 'UTC' })

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed right-0 z-30 w-40 transition-opacity duration-200 ease-ios',
        'bottom-[calc(env(safe-area-inset-bottom)+9.25rem)] md:bottom-28',
        visible || dragging || jumpingKey ? 'opacity-100' : 'opacity-0',
      )}
      style={{ top: trackTop || 120 }}
    >
      {dragging && (
        <div className="absolute -inset-y-8 right-0 w-40 bg-gradient-to-l from-base-50 from-55% to-base-50/0 dark:from-base-950 dark:to-base-950/0" />
      )}
      <div ref={trackRef} className="absolute inset-y-0 right-0 w-full">
        {dragging &&
          ticks
            .filter((t) => Math.abs(t.fraction - fraction) * trackPx > TICK_CLEAR_PX)
            .map((t) => (
              <div
                key={t.month}
                className="absolute right-5 flex -translate-y-1/2 items-center gap-2"
                style={{ top: `${t.fraction * 100}%` }}
              >
                <span className="flex flex-col items-end leading-tight">
                  {t.showYear && (
                    <span className="text-[11px] font-bold tabular-nums text-base-700 dark:text-base-200">
                      {monthLabel(t.month, { year: 'numeric' })}
                    </span>
                  )}
                  <span className="text-[12px] font-semibold tabular-nums text-base-500">
                    {monthLabel(t.month, { month: 'short' })}
                  </span>
                </span>
                <span className="h-0.5 w-3 rounded-full bg-base-300 dark:bg-base-700" />
              </div>
            ))}

        <div
          className="absolute right-1.5 flex items-center gap-2"
          style={{ top: `calc(${fraction * 100}% - ${HANDLE_H / 2}px)` }}
        >
          {dragging || jumpingKey ? (
            <div className="rounded-2xl bg-base-900/95 px-4 py-2.5 text-white shadow-elevated dark:bg-base-700/95">
              <div className="text-[12px] font-medium tabular-nums text-base-300">
                {fmt({ year: 'numeric' })}
              </div>
              <div className="whitespace-nowrap text-[22px] font-bold tabular-nums leading-tight tracking-tight">
                {fmt({ month: 'long', day: 'numeric' })}
              </div>
            </div>
          ) : (
            <div className="whitespace-nowrap rounded-full bg-base-900/80 px-3 py-1.5 text-[13px] font-semibold tabular-nums text-white backdrop-blur-md dark:bg-base-700/80">
              {fmt({ year: 'numeric', month: 'long' })}
            </div>
          )}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className={cn(
              // before: 보이는 손잡이보다 넓게 잡히도록(손가락 기준 44px 이상).
              "relative flex w-[34px] cursor-grab touch-none select-none flex-col items-center justify-center rounded-full before:absolute before:-inset-x-3 before:-inset-y-2 before:content-['']",
              'bg-base-0 text-base-500 shadow-elevated ring-1 ring-black/5 dark:bg-base-800 dark:text-base-300 dark:ring-white/10',
              visible || dragging || jumpingKey ? 'pointer-events-auto' : 'pointer-events-none',
              dragging && 'cursor-grabbing',
            )}
            style={{ height: HANDLE_H }}
          >
            {jumpingKey ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-base-300 border-t-point-500" />
            ) : (
              <>
                <ChevronUp size={14} strokeWidth={2.6} />
                <ChevronDown size={14} strokeWidth={2.6} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
