'use client'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import { useTheme } from '@/lib/theme'
import type { FeatureFlag } from '@bebe/core'
import {
  Calendar,
  Clock4,
  FolderOpen,
  Monitor,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items: {
  href: string
  label: string
  icon: typeof Clock4
  feature?: FeatureFlag
  manageOnly?: boolean
}[] = [
  { href: '/timeline', label: '타임라인', icon: Clock4 },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/albums', label: '앨범', icon: FolderOpen, feature: 'albums' },
  { href: '/story', label: '스토리', icon: NotebookPen, feature: 'diary' },
  { href: '/family', label: '가족', icon: Users, manageOnly: true },
  { href: '/settings', label: '설정', icon: Settings },
]

type Props = {
  familyName: string
  canManageFamily?: boolean
}

export function SideNav({ familyName, canManageFamily = true }: Props) {
  const pathname = usePathname()
  const features = useFeatures()
  const { mode, resolved, setMode } = useTheme()
  const visible = items.filter(
    (it) => (!it.feature || features[it.feature]) && (!it.manageOnly || canManageFamily),
  )

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
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-200/70 bg-base-0/70 backdrop-blur-xl md:flex dark:border-base-800/60 dark:bg-base-900/60">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-7">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-point-500 text-sm font-bold text-white shadow-sm">
          b
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-tight">
            bebe<span className="text-point-500">·</span>moment
          </div>
          <div className="truncate text-[11px] text-base-500">{familyName}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`) === true
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'focus-ring group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] font-medium transition-all ease-ios',
                active
                  ? 'bg-point-500/10 text-point-500'
                  : 'text-base-600 hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full bg-point-500 transition-all ease-ios',
                  active ? 'h-5 w-1 opacity-100' : 'h-0 w-0.5 opacity-0',
                )}
              />
              <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={cycle}
          title={`테마: ${themeTitle} (클릭으로 전환)`}
          className="focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium text-base-500 transition hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
        >
          <ThemeIcon size={16} strokeWidth={1.9} />
          <span className="flex-1 text-left">테마</span>
          <span className="text-[11px] text-base-400">{themeTitle}</span>
        </button>
      </div>
    </aside>
  )
}
