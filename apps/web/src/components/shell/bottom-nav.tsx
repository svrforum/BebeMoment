'use client'
import { cn } from '@/lib/cn'
import { Calendar, Clock4, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/timeline', label: '타임라인', icon: Clock4 },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/family', label: '가족', icon: Users },
  { href: '/settings', label: '설정', icon: Settings },
] as const

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-200/60 bg-base-0/85 backdrop-blur-xl md:hidden dark:border-base-800/60 dark:bg-base-950/80">
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex flex-col items-center justify-center gap-1 transition-colors ease-ios',
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
                  className={cn('h-5 w-5 transition-transform ease-ios', active && '-translate-y-px')}
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
