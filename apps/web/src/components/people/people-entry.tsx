import { ChevronRight, UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

/** 타임라인 상단 "사람" 진입점(컴팩트 1줄 타일) — features.faces 켜졌을 때만. */
export function PeopleEntry({ count }: { count: number }) {
  const t = useTranslations('misc')
  return (
    <Link
      href="/people"
      className="group flex items-center gap-2.5 rounded-2xl border border-base-200/70 bg-base-50 px-3.5 py-2.5 transition-colors hover:bg-base-100 dark:border-base-800 dark:bg-base-900"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-base-200/70 text-base-600 dark:bg-base-800 dark:text-base-300">
        <UsersRound className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-base-900 dark:text-base-50">
        {t('people.title')}
      </span>
      {count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-base-200 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-base-700 dark:bg-base-800 dark:text-base-200">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform group-hover:translate-x-0.5 dark:text-base-600" />
    </Link>
  )
}
