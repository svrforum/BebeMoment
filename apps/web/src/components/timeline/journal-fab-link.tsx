import Link from 'next/link'

export function JournalFabLink() {
  return (
    <Link
      href="/journal/new"
      aria-label="일기 쓰기"
      className="fixed bottom-36 right-5 z-30 h-12 rounded-full bg-base-0 text-base-900 shadow-lg border border-base-200 px-4 flex items-center gap-2 text-sm dark:bg-base-900 dark:text-base-100 dark:border-base-700"
    >
      ✎ 일기
    </Link>
  )
}
