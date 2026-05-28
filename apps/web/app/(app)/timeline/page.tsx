import { AppHeader } from '@/components/shell/app-header'
import { DiaryCard, DiaryStoryChip } from '@/components/timeline/diary-card'
import { TimelineSortToggle } from '@/components/timeline/sort-toggle'
import { TagFilterStrip } from '@/components/timeline/tag-filter-strip'
import { TimelineComposer } from '@/components/timeline/timeline-composer'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { getFeatureFlags } from '@/server/settings/features'
import { formatDDay, groupAssetsByDay } from '@/server/timeline/group-by-day'
import { listTimeline } from '@/server/timeline/merged-list'
import Link from 'next/link'

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[]; date?: string; sort?: string }>
}) {
  const ctx = await getContext()
  if (!ctx.family) return null
  const { tag, date, sort } = await searchParams
  const tagSlugs = Array.isArray(tag) ? tag : tag ? [tag] : []
  const dateFilter = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  const sortMode: 'taken' | 'uploaded' = sort === 'uploaded' ? 'uploaded' : 'taken'

  const viewerRole = ctx.membership?.role ?? 'family'
  // TODO(multi-baby): 다아기 가족(쌍둥이 등) UX 는 추후 — 지금은 가장 먼저
  // 태어난 아기 1명 기준으로 D-day · 나이 버킷을 계산한다.
  const [baby, { items }] = await Promise.all([
    prismaPublic.baby.findFirst({
      where: { familyId: ctx.family.id, deletedAt: null },
      orderBy: { birthDate: 'asc' },
    }),
    listTimeline(
      ctx.family.id,
      {
        limit: 100,
        viewerRole,
        sort: sortMode,
        ...(tagSlugs.length > 0 ? { tagSlugs } : {}),
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])
  const birthDate: Date | null = baby?.birthDate ?? null

  const assetItems = items.filter((it) => it.kind === 'asset')
  const diaryItems = items.filter((it) => it.kind === 'journal')

  // 그룹의 ts (날짜 헤더 기준) 는 sort 모드를 따라간다. taken=촬영일,
  // uploaded=업로드 시각 (createdAt). 날짜 헤더가 사용자가 토글한 축과
  // 일치하도록 — sort=uploaded 일 때 "오늘 올린 사진" 들이 오늘 헤더 아래 모임.
  const groups = groupAssetsByDay(
    assetItems.map((it) => {
      const a = it.kind === 'asset' ? it.asset : null
      if (!a) throw new Error('unreachable')
      return {
        id: a.id,
        ts: sortMode === 'uploaded' ? a.createdAt : a.takenAt,
        status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
        kind: a.kind as 'image' | 'video',
        urls: a.urls,
      }
    }),
    birthDate,
  ).map((g) => ({
    label: g.dateLabel,
    ageLabel: g.bucketLabel,
    dDay: g.babyDays !== null ? formatDDay(g.babyDays) : null,
    assets: g.assets,
  }))

  // 날짜 필터 모드(캘린더에서 진입): 그 날의 스토리(일기)와 사진을 보여준다.
  // 컴포저·태그 섹션은 숨기고, 상단에 날짜 배너 + 전체 보기로 돌아가는 링크.
  if (dateFilter) {
    const label = new Date(`${dateFilter}T00:00:00.000Z`).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    })
    const photoCount = assetItems.length
    const isEmpty = photoCount === 0 && diaryItems.length === 0
    return (
      <>
        <AppHeader title="캘린더" wide />
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-2">
          <div className="flex items-center justify-between rounded-2xl border border-base-200/70 bg-base-0 px-4 py-3 dark:border-base-800/70 dark:bg-base-900">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold text-base-900 dark:text-base-50">
                {label}
              </span>
              <span className="text-[13px] tabular-nums text-base-400">
                ·{diaryItems.length > 0 ? ` 스토리 ${diaryItems.length}` : ''} 사진 {photoCount}
              </span>
            </div>
            <Link
              href="/timeline"
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-point-600 transition hover:bg-base-100 dark:text-point-400 dark:hover:bg-base-800"
            >
              전체 보기
            </Link>
          </div>
        </div>
        {diaryItems.length > 0 && (
          <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-4 space-y-3">
            {diaryItems.map((it) =>
              it.kind === 'journal' ? <DiaryCard key={`j-${it.id}`} entry={it.entry} /> : null,
            )}
          </div>
        )}
        {isEmpty ? (
          <div className="mx-auto max-w-3xl px-5 py-16 text-center text-sm text-base-400">
            이 날짜에 올린 게 없어요.
          </div>
        ) : photoCount > 0 ? (
          <TimelineGrid initialGroups={groups} />
        ) : null}
      </>
    )
  }

  const features = await getFeatureFlags(prismaPublic)

  return (
    <>
      {baby ? (
        <AppHeader title={ctx.family.name} subtitle={baby.name} wide />
      ) : (
        <AppHeader title={ctx.family.name} wide />
      )}
      <TimelineSortToggle
        value={sortMode}
        preserveParams={tagSlugs.length > 0 ? { tag: tagSlugs } : {}}
      />
      {features.tags && (
        <TagFilterStrip
          familyId={ctx.family.id}
          prismaPublic={prismaPublic}
          activeSlugs={tagSlugs}
        />
      )}
      {tagSlugs.length === 0 && features.diary && ctx.capabilities.includes('record.create') && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-3">
          <TimelineComposer
            userDisplayName={ctx.user?.displayName ?? '나'}
            userAvatarPath={ctx.user?.avatarPath ?? null}
            babyId={baby?.id ?? null}
            viewerRole={viewerRole}
            canUpload={ctx.capabilities.includes('asset.upload')}
          />
        </div>
      )}
      {diaryItems.length > 0 && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-4 space-y-3">
          {/* 최근 일기 1개는 글까지 큰 카드로, 나머지는 가로 스토리 행에 조그맣게. */}
          {diaryItems[0]?.kind === 'journal' && (
            <DiaryCard key={`j-${diaryItems[0].id}`} entry={diaryItems[0].entry} />
          )}
          {diaryItems.length > 1 && (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {diaryItems
                .slice(1)
                .map((it) =>
                  it.kind === 'journal' ? (
                    <DiaryStoryChip key={`j-${it.id}`} entry={it.entry} />
                  ) : null,
                )}
            </div>
          )}
        </div>
      )}
      <TimelineGrid initialGroups={groups} />
    </>
  )
}
