'use client'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import { useTheme } from '@/lib/theme'
import type { FeatureFlag } from '@bebe/core'
import {
  Bookmark,
  Calendar,
  Clock4,
  FolderOpen,
  Monitor,
  Moon,
  NotebookPen,
  Settings,
  Sun,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isNavActive } from './nav-active'

const items: {
  href: string
  labelKey: string
  icon: typeof Clock4
  feature?: FeatureFlag
  manageOnly?: boolean
  bookmarkOnly?: boolean
}[] = [
  { href: '/timeline', labelKey: 'timeline', icon: Clock4 },
  { href: '/calendar', labelKey: 'calendar', icon: Calendar },
  { href: '/albums', labelKey: 'albums', icon: FolderOpen, feature: 'albums' },
  { href: '/story', labelKey: 'story', icon: NotebookPen, feature: 'diary' },
  { href: '/saved', labelKey: 'bookmark', icon: Bookmark, bookmarkOnly: true },
  { href: '/settings', labelKey: 'settings', icon: Settings },
]

type Props = {
  familyName: string
  canManageFamily?: boolean
  hiddenNav?: string[]
  showBookmark?: boolean
}

export function SideNav({
  familyName,
  canManageFamily = true,
  hiddenNav = [],
  showBookmark = false,
}: Props) {
  const pathname = usePathname()
  const features = useFeatures()
  const tn = useTranslations('nav')
  const t = useTranslations('shell')
  const { mode, resolved, setMode } = useTheme()
  const visible = items.filter(
    (it) =>
      (!it.feature || features[it.feature]) &&
      (!it.manageOnly || canManageFamily) &&
      (!it.bookmarkOnly || showBookmark) &&
      !hiddenNav.includes(it.href.slice(1)),
  )

  const cycle = () => {
    const next = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'
    setMode(next)
  }
  const ThemeIcon = mode === 'auto' ? Monitor : mode === 'dark' ? Moon : Sun
  const themeTitle =
    mode === 'auto'
      ? t('theme.auto', { resolved: resolved === 'dark' ? t('theme.dark') : t('theme.light') })
      : mode === 'light'
        ? t('theme.light')
        : t('theme.dark')

  // 상세 뷰어(fixed inset-0)가 덮는 동안 Tab 이 안 보이는 사이드바 링크로 새지 않게 — 바텀 네비와 같은 가드.
  if (pathname?.startsWith('/detail') === true) return null

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-200/70 bg-base-0/70 backdrop-blur-xl md:flex dark:border-base-800/60 dark:bg-base-900/60">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-7">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-point-500 text-sm font-bold text-white shadow-sm">
          b
        </span>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
            {familyName}
          </div>
          <div className="truncate text-[11px] text-base-500">
            bebe<span className="text-point-500">·</span>moment
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {visible.map(({ href, labelKey, icon: Icon }) => {
          const active = isNavActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] font-medium transition-colors ease-ios',
                active
                  ? 'bg-point-500/10 text-point-700 dark:text-point-300'
                  : 'text-base-600 hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-point-500 transition-[scale,opacity] ease-ios',
                  active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                )}
              />
              <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
              {tn(labelKey)}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={cycle}
          title={t('theme.tooltip', { value: themeTitle })}
          className="focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium text-base-500 transition hover:bg-base-100 hover:text-base-900 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
        >
          <ThemeIcon size={16} strokeWidth={1.9} />
          <span className="flex-1 text-left">{t('theme.label')}</span>
          <span className="text-[11px] text-base-500">{themeTitle}</span>
        </button>
      </div>
    </aside>
  )
}
