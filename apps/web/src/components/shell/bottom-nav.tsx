'use client'
import { cn } from '@/lib/cn'
import { useFeatures } from '@/lib/features'
import type { FeatureFlag } from '@bebe/core'
import { Calendar, Clock4, FolderOpen, NotebookPen, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 스토리를 가운데(5개 중 3번째)에. 기능 OFF 면 해당 항목이 빠지고 그리드 열수도
// 자동 조정(아래 visible + gridTemplateColumns). 설정은 /family 페이지 하단의
// 행으로 이동했다.
const items: { href: string; label: string; icon: typeof Clock4; feature?: FeatureFlag }[] = [
  { href: '/timeline', label: '타임라인', icon: Clock4 },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/diary', label: '스토리', icon: NotebookPen, feature: 'diary' },
  { href: '/albums', label: '앨범', icon: FolderOpen, feature: 'albums' },
  { href: '/family', label: '가족', icon: Users },
]

export function BottomNav() {
  const pathname = usePathname()
  const features = useFeatures()
  // 상세 뷰어는 자체 액션바를 가진 몰입형 화면 — 전역 네비를 숨긴다.
  if (pathname?.startsWith('/detail') === true) return null
  const visible = items.filter((it) => !it.feature || features[it.feature])
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-200/60 bg-base-0/85 backdrop-blur-xl md:hidden dark:border-base-800/60 dark:bg-base-950/80">
      <div
        className="mx-auto grid h-16 max-w-3xl pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`) === true
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
                  'flex h-7 w-12 items-center justify-center rounded-full transition-all ease-ios',
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
