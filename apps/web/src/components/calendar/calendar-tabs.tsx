'use client'
import { cn } from '@/lib/cn'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

/**
 * 월 그리드와 할 일 목록 사이의 전환. **쿼리가 아니라 실제 경로**다 — 쿼리만 바뀌는
 * 내비게이션은 캐시된 셸을 재사용할 수 있고, 캘린더는 이미 그 자가복구 코드를 달고 있다.
 */
export function CalendarTabs({ current }: { current: 'month' | 'todo' }) {
  const t = useTranslations('schedule')
  const tabs = [
    { key: 'month', href: '/calendar', label: t('tabs.month') },
    { key: 'todo', href: '/calendar/todo', label: t('tabs.todo') },
  ] as const

  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl bg-base-100 p-1 dark:bg-base-800">
      {tabs.map((tab) => {
        const active = tab.key === current
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              'focus-ring flex h-9 items-center rounded-lg px-4 text-[14px] font-medium transition-colors ease-ios',
              active
                ? 'bg-base-0 text-base-900 shadow-sm dark:bg-base-950 dark:text-base-50'
                : 'text-base-600 hover:text-base-900 dark:text-base-400',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
