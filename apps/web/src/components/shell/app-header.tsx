'use client'
import { cn } from '@/lib/cn'
import { type ReactNode, useEffect, useState } from 'react'

type Props = {
  title: string
  subtitle?: string
  right?: ReactNode
}

export function AppHeader({ title, subtitle, right }: Props) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-30 bg-base-50/80 dark:bg-base-950/80 backdrop-blur-md',
        'transition-all ease-ios duration-200',
        compact ? 'border-b border-base-200 dark:border-base-800' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto max-w-3xl px-5">
        <div
          className={cn(
            'flex items-center justify-between gap-3 transition-all ease-ios',
            compact ? 'h-12' : 'h-20 items-end pb-2',
          )}
        >
          <div className={cn('flex-1 min-w-0', compact ? 'text-center' : '')}>
            <h1
              className={cn(
                'font-bold tracking-tight text-base-900 dark:text-base-50 transition-all ease-ios truncate',
                compact ? 'text-base' : 'text-2xl',
              )}
            >
              {title}
            </h1>
            {subtitle && !compact && (
              <p className="text-sm text-base-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
        </div>
      </div>
    </header>
  )
}
