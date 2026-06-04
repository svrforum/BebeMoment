'use client'
import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Debounced search box that drives a `?q=` search param. The page reads `q`
 * server-side and renders filtered results. Keeps the URL shareable/back-able.
 */
export function SearchBox({ placeholder }: { placeholder?: string }) {
  const t = useTranslations('common')
  const resolvedPlaceholder = placeholder ?? t('search.placeholder')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when navigating (back/forward) changes the URL externally.
  useEffect(() => {
    setValue(params.get('q') ?? '')
  }, [params])

  const push = (q: string) => {
    const next = new URLSearchParams(params.toString())
    if (q.trim()) next.set('q', q.trim())
    else next.delete('q')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const onChange = (v: string) => {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(v), 250)
  }

  return (
    <div className="relative">
      <Search
        size={16}
        strokeWidth={2.2}
        className="-translate-y-1/2 absolute top-1/2 left-3.5 text-base-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        className="h-11 w-full rounded-2xl border border-base-200 bg-base-0 pr-10 pl-10 text-[14px] outline-none focus:border-point-500 dark:border-base-800 dark:bg-base-900"
      />
      {value && (
        <button
          type="button"
          aria-label={t('search.clear')}
          onClick={() => {
            setValue('')
            if (timer.current) clearTimeout(timer.current)
            push('')
          }}
          className="-translate-y-1/2 absolute top-1/2 right-3 flex h-6 w-6 items-center justify-center rounded-full text-base-400 hover:bg-base-100 dark:hover:bg-base-800"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  )
}
