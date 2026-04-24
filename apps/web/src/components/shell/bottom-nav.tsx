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
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-200 bg-base-0/95 backdrop-blur-md md:hidden dark:border-base-800 dark:bg-base-950/95">
      <div className="mx-auto max-w-3xl grid grid-cols-4 h-16 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors ease-ios',
                active ? 'text-point-500' : 'text-base-500 hover:text-base-700',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
