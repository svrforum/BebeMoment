'use client'
import { cn } from '@/lib/cn'

type SegmentedProps<T extends string> = {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn('inline-flex p-1 rounded-xl bg-base-100 dark:bg-base-800 gap-1', className)}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-4 h-9 rounded-lg text-sm font-medium transition-colors ease-ios',
              active
                ? 'bg-base-0 dark:bg-base-950 text-base-900 dark:text-base-50 shadow-sm'
                : 'text-base-600 dark:text-base-400 hover:text-base-900',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
