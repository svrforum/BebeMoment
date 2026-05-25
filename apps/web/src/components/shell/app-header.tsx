'use client'
import { cn } from '@/lib/cn'
import { type ReactNode, useEffect, useState } from 'react'

type Props = {
  title: string
  subtitle?: string
  left?: ReactNode
  right?: ReactNode
}

export function AppHeader({ title, subtitle, left, right }: Props) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const p = Math.min(1, Math.max(0, window.scrollY / 80))
      setProgress(p)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const compact = progress > 0.6
  const titleScale = 1 - progress * 0.4
  const titleY = -progress * 4

  return (
    <header
      className={cn(
        'sticky top-0 z-30 transition-[background-color,backdrop-filter] ease-ios duration-200',
        compact
          ? 'bg-base-50/80 backdrop-blur-xl dark:bg-base-950/70'
          : 'bg-base-50/0 dark:bg-base-950/0',
      )}
      style={{ WebkitBackdropFilter: compact ? 'blur(20px) saturate(180%)' : undefined }}
    >
      <div className="mx-auto max-w-3xl px-5">
        <div className="flex h-12 items-center justify-between gap-3">
          {left && <div className="flex flex-shrink-0 items-center gap-2">{left}</div>}
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity ease-ios duration-200',
              compact ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div className="truncate text-center text-base font-semibold text-base-900 dark:text-base-50">
              {title}
            </div>
          </div>
          {right && <div className="flex flex-shrink-0 items-center gap-2">{right}</div>}
        </div>
        <div
          className={cn(
            'overflow-hidden transition-[max-height,opacity] ease-ios duration-200',
            compact ? 'max-h-0 opacity-0' : 'max-h-32 opacity-100',
          )}
        >
          <div className="origin-left pb-4 pt-1">
            <h1
              className="truncate text-[34px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50"
              style={{
                transform: `scale(${titleScale}) translateY(${titleY}px)`,
                transformOrigin: 'left bottom',
                transition: 'transform 120ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {title}
            </h1>
            {subtitle && <p className="mt-1 truncate text-[15px] text-base-500">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div
        className={cn(
          'pointer-events-none h-px w-full bg-base-200 transition-opacity ease-ios duration-200 dark:bg-base-800',
          compact ? 'opacity-100' : 'opacity-0',
        )}
      />
    </header>
  )
}
