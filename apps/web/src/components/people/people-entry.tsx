import { ChevronRight, UsersRound } from 'lucide-react'
import Link from 'next/link'

/** 타임라인 상단 "사람" 진입점 — features.faces 켜졌을 때만 노출. */
export function PeopleEntry({ count }: { count: number }) {
  return (
    <Link
      href="/people"
      className="group flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-50 px-4 py-3 transition-colors hover:bg-base-100 dark:border-base-800 dark:bg-base-900"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-base-200/70 text-base-600 dark:bg-base-800 dark:text-base-300">
        <UsersRound className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-base-900 dark:text-base-50">
          사람
        </span>
        <span className="block text-[12.5px] text-base-500">
          {count > 0 ? '얼굴로 모은 사람들을 볼 수 있어요' : '새 사진을 올리면 사람별로 모아드려요'}
        </span>
      </span>
      {count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-base-200 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-base-700 dark:bg-base-800 dark:text-base-200">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform group-hover:translate-x-0.5 dark:text-base-600" />
    </Link>
  )
}
