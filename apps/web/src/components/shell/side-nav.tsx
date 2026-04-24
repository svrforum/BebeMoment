'use client'
import { cn } from '@/lib/cn'
import { useTheme } from '@/lib/theme'
import { BookmarkIcon, Calendar, Clock4, Monitor, Moon, Settings, Sun, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/timeline', label: '타임라인', icon: Clock4 },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/journal', label: '일기', icon: BookmarkIcon },
  { href: '/family', label: '가족', icon: Users },
  { href: '/settings', label: '설정', icon: Settings },
] as const

type Props = {
  familyName: string
}

export function SideNav({ familyName }: Props) {
  const pathname = usePathname()
  const { mode, resolved, setMode } = useTheme()

  const cycle = () => {
    const next = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'
    setMode(next)
  }
  const ThemeIcon = mode === 'auto' ? Monitor : mode === 'dark' ? Moon : Sun
  const themeTitle =
    mode === 'auto'
      ? `자동 (${resolved === 'dark' ? '다크' : '라이트'})`
      : mode === 'light'
        ? '라이트'
        : '다크'

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-200 bg-base-0/80 backdrop-blur-xl md:flex dark:border-base-800 dark:bg-base-900/80">
      <div className="flex items-center gap-2 px-5 pb-4 pt-6">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-point-500 text-sm font-bold text-white">
          b
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            bebe<span className="text-point-500">·</span>moment
          </div>
          <div className="truncate text-xs text-base-500">{familyName}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-point-500/10 text-point-500'
                  : 'text-base-600 hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-base-200 p-3 dark:border-base-800">
        <button
          type="button"
          onClick={cycle}
          title={`테마: ${themeTitle} (클릭으로 전환)`}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-base-600 transition hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
        >
          <ThemeIcon size={18} />
          <span className="flex-1 text-left">테마</span>
          <span className="text-xs text-base-500">{themeTitle}</span>
        </button>
      </div>
    </aside>
  )
}
