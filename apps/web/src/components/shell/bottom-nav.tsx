'use client'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import type { FeatureFlag } from '@bebe/core'
import { Bookmark, Calendar, Clock4, FolderOpen, NotebookPen, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { UnreadBadge } from './unread-badge'

// 스토리를 가운데(5개 중 3번째)에. 기능 OFF 면 해당 항목이 빠지고 그리드 열수도
// 자동 조정(아래 visible + gridTemplateColumns). 마지막 칸은 모두에게 설정 —
// 가족 관리는 설정 → 가족에서 들어간다.
const baseItems: { href: string; label: string; icon: typeof Clock4; feature?: FeatureFlag }[] = [
  { href: '/timeline', label: '타임라인', icon: Clock4 },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/story', label: '스토리', icon: NotebookPen, feature: 'diary' },
  { href: '/albums', label: '앨범', icon: FolderOpen, feature: 'albums' },
]

type Props = {
  /** Optional per-route unread counts. Currently only '/timeline' is used. */
  unreadCounts?: Record<string, number>
  /** 레이아웃이 사이드내비와 공유해 넘기지만 하단 네비는 마지막 칸을 항상 설정으로 둔다. */
  canManageFamily?: boolean
  /** 관리자가 일반 가족에게 숨긴 메뉴 키(예: ['story','albums']). */
  hiddenNav?: string[]
  /** 스토리·앨범이 숨겨진 가족에게 북마크(저장함) 바로가기를 노출. */
  showBookmark?: boolean
}

export function BottomNav({ unreadCounts, hiddenNav = [], showBookmark = false }: Props = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const features = useFeatures()
  // 상세 뷰어는 자체 액션바를 가진 몰입형 화면 — 전역 네비를 숨긴다.
  if (pathname?.startsWith('/detail') === true) return null
  // 캘린더에서 특정 날짜로 들어온 화면(/timeline?date=)은 캘린더 맥락이므로 캘린더 탭을 활성으로.
  const inDateView = pathname === '/timeline' && searchParams.get('date') !== null
  const lastItem = { href: '/settings', label: '설정', icon: Settings }
  const visible = [
    ...baseItems.filter(
      (it) => (!it.feature || features[it.feature]) && !hiddenNav.includes(it.href.slice(1)),
    ),
    ...(showBookmark ? [{ href: '/saved', label: '북마크', icon: Bookmark }] : []),
    lastItem,
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-200/60 bg-base-0/85 backdrop-blur-xl md:hidden dark:border-base-800/60 dark:bg-base-950/80">
      <div
        className="mx-auto grid h-16 max-w-3xl pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map(({ href, label, icon: Icon }) => {
          const active = inDateView
            ? href === '/calendar'
            : pathname === href || pathname?.startsWith(`${href}/`) === true
          const unread = unreadCounts?.[href] ?? 0
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ease-ios focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-point-500/50',
                active ? 'text-point-500' : 'text-base-400',
              )}
            >
              <span
                className={cn(
                  'relative flex h-7 w-12 items-center justify-center rounded-full transition-all ease-ios',
                  active ? 'bg-point-500/12 scale-100' : 'bg-transparent scale-95',
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform ease-ios',
                    active && '-translate-y-px',
                  )}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                {unread > 0 && <UnreadBadge count={unread} />}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium transition-opacity',
                  active ? 'opacity-100' : 'opacity-70',
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
