import { ChevronRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

/** 스토리 화면 상단 "추억" 진입점. 항상 노출되고, 오늘 추억이 있으면 개수 뱃지. */
export function MemoriesEntry({ count }: { count: number }) {
  return (
    <Link
      href="/memories"
      className="group flex items-center gap-3 rounded-2xl border border-point-500/20 bg-point-500/5 px-4 py-3 transition-colors hover:bg-point-500/10 dark:border-point-500/25"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-point-500/15 text-point-600 dark:text-point-300">
        <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-base-900 dark:text-base-50">
          추억
        </span>
        <span className="block text-[12.5px] text-base-500">
          {count > 0 ? '오늘과 같은 날의 지난 순간들이 있어요' : '시간이 쌓이면 여기서 다시 만나요'}
        </span>
      </span>
      {count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-point-500 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white">
          오늘 {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-base-300 transition-transform group-hover:translate-x-0.5 dark:text-base-600" />
    </Link>
  )
}
