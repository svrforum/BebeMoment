import { AppHeader } from '@/components/shell/app-header'
import { JournalCard } from '@/components/timeline/journal-card'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listJournalEntries } from '@/server/journal/list'
import { BookOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function JournalPage() {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')

  const { items } = await listJournalEntries(
    ctx.family.id,
    { limit: 50 },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )

  return (
    <>
      <AppHeader
        title="일기"
        right={
          <Link
            href="/diary/new"
            className="flex h-9 items-center gap-1.5 rounded-full bg-point-500 px-3.5 text-[13px] font-medium text-white shadow-sm transition-transform ease-ios active:scale-95 hover:bg-point-600"
            aria-label="일기 쓰기"
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            <span>쓰기</span>
          </Link>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-4">
        {items.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center">
            <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
              <BookOpen className="h-10 w-10 text-base-400" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-base font-semibold text-base-900 dark:text-base-50">
                첫 일기를 시작해볼까요
              </p>
              <p className="mt-1 text-sm text-base-500">
                오늘의 이야기를 짧게라도 남겨두면 나중에 큰 추억이 돼요
              </p>
            </div>
            <Link
              href="/diary/new"
              className="mt-2 rounded-full bg-base-900 px-5 py-2.5 text-sm font-medium text-base-50 transition-transform ease-ios active:scale-95 dark:bg-base-50 dark:text-base-900"
            >
              일기 쓰기
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((e) => (
              <li key={e.id}>
                <JournalCard entry={e} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
