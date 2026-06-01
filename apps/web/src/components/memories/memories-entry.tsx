import { ChevronRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

/** 타임라인 상단 "추억" 진입점(컴팩트 1줄 타일). 오늘 추억이 있으면 개수 뱃지. */
export function MemoriesEntry({ count }: { count: number }) {
  return (
    <Link
      href="/memories"
      className="group flex items-center gap-2.5 rounded-2xl border border-point-500/20 bg-point-500/5 px-3.5 py-2.5 transition-colors hover:bg-point-500/10 dark:border-point-500/25"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-point-500/15 text-point-600 dark:text-point-300">
        <Sparkles className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-base-900 dark:text-base-50">
        추억
      </span>
      {count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-point-500 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform group-hover:translate-x-0.5 dark:text-base-600" />
    </Link>
  )
}
