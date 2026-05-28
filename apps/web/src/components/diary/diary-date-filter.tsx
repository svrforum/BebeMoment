'use client'
import { cn } from '@/lib/cn'
import { Calendar, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/** Formats a `YYYY-MM-DD` string as `YYYY.MM.DD` for the active-date chip. */
function formatChip(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return date
  return `${m[1]}.${m[2]}.${m[3]}`
}

/**
 * Calendar-icon button + native date input. Reads/writes `?date=YYYY-MM-DD`
 * on the current URL, preserving other params. The button itself is a small
 * pill (icon only); when a date is active, a chip with an X clear affordance
 * appears next to it. Pairs with `SearchBox` (which owns `?q=`).
 */
export function DiaryDateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const active = params.get('date') ?? ''
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Local mirror so the native picker shows the current selection when opened.
  const [value, setValue] = useState(active)

  useEffect(() => {
    setValue(active)
  }, [active])

  const push = (next: string) => {
    const usp = new URLSearchParams(params.toString())
    if (next) usp.set('date', next)
    else usp.delete('date')
    const qs = usp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    // `showPicker` is the spec way; fall back to focus+click for older Safari.
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {}
    }
    el.focus()
    el.click()
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          aria-label="날짜로 필터"
          aria-pressed={active ? true : false}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-2xl border bg-base-0 text-base-700 transition-colors ease-ios active:scale-95',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/30',
            active
              ? 'border-point-500 text-point-600 dark:border-point-500 dark:text-point-400'
              : 'border-base-200 hover:bg-base-100 dark:border-base-800 dark:bg-base-900 dark:text-base-300 dark:hover:bg-base-800',
          )}
        >
          <Calendar size={18} strokeWidth={2.2} />
        </button>
        {/* Native input drives picker UX; visually hidden but accessible to the
            browser's date picker positioning. Pinned to the trigger so the
            picker opens nearby. */}
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => {
            const next = e.target.value
            setValue(next)
            push(next)
          }}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
      {active && (
        <span className="flex h-9 items-center gap-1.5 rounded-full bg-point-500/10 pr-1.5 pl-3 text-[13px] font-medium text-point-700 dark:bg-point-500/15 dark:text-point-300">
          <span>{formatChip(active)}</span>
          <button
            type="button"
            aria-label="날짜 필터 지우기"
            onClick={() => {
              setValue('')
              push('')
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-point-700/70 hover:bg-point-500/15 dark:text-point-300/80"
          >
            <X size={13} strokeWidth={2.6} />
          </button>
        </span>
      )}
    </div>
  )
}
