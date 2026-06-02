import { AppHeader } from '@/components/shell/app-header'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { StoryDateFilter } from '@/components/story/story-date-filter'
import { StoryCard, storyCardDataFromEntry } from '@/components/story/story-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchBox } from '@/components/ui/search-box'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listStoryEntries } from '@/server/story/list'
import { Award, BookOpen, Plus, Ruler, Search, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

type Entry = Awaited<ReturnType<typeof listStoryEntries>>['items'][number]

function monthLabel(d: Date): string {
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`
}

/** entryDate desc 정렬 항목을 월별로 묶는다(가독성). */
function groupByMonth(items: Entry[]): { label: string; entries: Entry[] }[] {
  const out: { label: string; entries: Entry[] }[] = []
  for (const e of items) {
    const label = monthLabel(e.entryDate)
    const last = out[out.length - 1]
    if (last && last.label === label) last.entries.push(e)
    else out.push({ label, entries: [e] })
  }
  return out
}

export default async function StoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string }>
}) {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')
  const { q, date } = await searchParams
  const query = typeof q === 'string' && q.trim() ? q.trim() : undefined
  const dateFilter =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : undefined

  const { items } = await listStoryEntries(
    ctx.family.id,
    {
      limit: 50,
      viewerRole: ctx.membership?.role ?? 'family',
      ...(query ? { q: query } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  const groups = groupByMonth(items)
  // 가장 먼저 태어난 아기 기준 — 성장기록·마일스톤 진입점에 사용.
  const baby = await prismaPublic.baby.findFirst({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
    select: { id: true },
  })
  const canRecord = ctx.capabilities.includes('record.create')
  const emptyDescription = [query ? `"${query}"` : null, dateFilter ?? null]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PullToRefresh />
      <AppHeader
        title="스토리"
        right={
          canRecord ? (
            <Link
              href="/story/new"
              className="flex h-9 items-center gap-1.5 rounded-full bg-point-500 px-3.5 text-[13px] font-medium text-white shadow-sm transition-transform ease-ios active:scale-95 hover:bg-point-600"
              aria-label="스토리 쓰기"
            >
              <Plus className="h-4 w-4" strokeWidth={2.6} />
              <span>쓰기</span>
            </Link>
          ) : null
        }
      />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchBox placeholder="스토리 검색 (제목·내용)" />
          </div>
          <StoryDateFilter />
        </div>

        {!query && !dateFilter && baby && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Link
              href={`/babies/${baby.id}/growth`}
              className="flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-0 p-4 shadow-card transition active:scale-[0.98] hover:bg-base-50 dark:border-base-800/70 dark:bg-base-900 dark:hover:bg-base-800/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-point-500/10 text-point-500">
                <Ruler size={20} strokeWidth={2.1} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-base-900 dark:text-base-50">
                  성장 기록
                </span>
                <span className="block text-[12px] text-base-500">키 · 몸무게</span>
              </span>
            </Link>
            <Link
              href={`/babies/${baby.id}/milestones`}
              className="flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-0 p-4 shadow-card transition active:scale-[0.98] hover:bg-base-50 dark:border-base-800/70 dark:bg-base-900 dark:hover:bg-base-800/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <Award size={20} strokeWidth={2.1} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-base-900 dark:text-base-50">
                  마일스톤
                </span>
                <span className="block text-[12px] text-base-500">발달 기록</span>
              </span>
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          query || dateFilter ? (
            <EmptyState icon={Search} title="검색 결과가 없어요" description={emptyDescription} />
          ) : canRecord ? (
            <EmptyState
              icon={BookOpen}
              title="첫 스토리를 시작해볼까요"
              description="오늘의 이야기를 짧게라도 남겨두면 나중에 큰 추억이 돼요"
              action={
                <Link
                  href="/story/new"
                  className="mt-2 rounded-full bg-base-900 px-5 py-2.5 text-sm font-medium text-base-50 transition-transform ease-ios active:scale-95 hover:bg-base-800 dark:bg-base-50 dark:text-base-900 dark:hover:bg-base-200"
                >
                  스토리 쓰기
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="아직 올라온 스토리가 없어요"
              description="곧 새로운 이야기가 올라올 거예요"
              action={
                <Link
                  href="/settings#notifications"
                  className="mt-2 text-sm font-medium text-point-600 transition hover:text-point-700 dark:text-point-400 dark:hover:text-point-300"
                >
                  알림 켜기
                </Link>
              }
            />
          )
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.label}>
                <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-tight text-base-500">
                  {g.label}
                </h2>
                <ul className="space-y-3">
                  {g.entries.map((e) => (
                    <li key={e.id}>
                      <StoryCard data={storyCardDataFromEntry(e)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
