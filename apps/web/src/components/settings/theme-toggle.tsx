'use client'
import { cn } from '@/lib/cn'
import { type ThemeMode, useTheme } from '@/lib/theme'
import { Monitor, Moon, Sun } from 'lucide-react'

const OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'auto', label: '자동', icon: Monitor },
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div className="flex items-center gap-1 rounded-full border border-base-200 bg-base-100 p-1 dark:border-base-800 dark:bg-base-800">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition',
              active
                ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-900 dark:text-base-50'
                : 'text-base-500 hover:text-base-900 dark:hover:text-base-100',
            )}
          >
            <Icon size={14} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
