import { AppHeader } from '@/components/shell/app-header'
import { type StoryCardData, storyCardDataFromEntry } from '@/components/story/story-card'
import { StoryStrip } from '@/components/timeline/bucket-section'
import { hasUnnamedPerson } from '@/server/people/list'
import { MemoriesCard } from '@/components/timeline/memories-card'
import { TimelineSortToggle } from '@/components/timeline/sort-toggle'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { TimelineComposer } from '@/components/timeline/timeline-composer'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { touchLastSeen } from '@/server/family/touch-last-seen'
import { getFeatureFlags } from '@/server/settings/features'
import { getSetting } from '@/server/settings/get'
import { listMemories } from '@/server/memories/list'
import { babyDaysDiff, formatDDay, groupAssetsByDay } from '@/server/timeline/group-by-day'
import { bucketLabel } from '@bebe/core'
import { listTimeline } from '@/server/timeline/merged-list'
import { ArrowLeft, Sparkles, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { z } from 'zod'

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; sort?: string }>
}) {
  const ctx = await getContext()
  if (!ctx.family) return null
  const { date, sort } = await searchParams
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
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])
  const birthDate: Date | null = baby?.birthDate ?? null
  // 가족 이름 아래 부제: "아기이름 · D+89 · 생후 2개월" (출생일 기준 D-day + 나이 버킷).
  const babySubtitle = baby
    ? birthDate
      ? `${baby.name} · ${formatDDay(babyDaysDiff(birthDate, new Date()))} · ${bucketLabel(birthDate, new Date())}`
      : baby.name
    : null

  const assetItems = items.filter((it) => it.kind === 'asset')
  const storyItems = items.filter((it) => it.kind === 'story')

  // 그룹의 ts (날짜 헤더 기준) 는 sort 모드를 따라간다. taken=촬영일,
  // uploaded=업로드 시각 (createdAt). 날짜 헤더가 사용자가 토글한 축과
  // 일치하도록 — sort=uploaded 일 때 "오늘 올린 사진" 들이 오늘 헤더 아래 모임.
  const groups = groupAssetsByDay(
    assetItems.map((it) => {
      const a = it.kind === 'asset' ? it.asset : null
      if (!a) throw new Error('unreachable')
      return {
        id: a.id,
        publicNo: a.publicNo,
        ts: sortMode === 'uploaded' ? a.createdAt : a.takenAt,
        status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
        kind: a.kind as 'image' | 'video',
        urls: a.urls,
        durationMs: a.durationMs ?? null,
      }
    }),
    birthDate,
  ).map((g) => ({
    dateKey: g.dateKey,
    label: g.dateLabel,
    ageLabel: g.bucketLabel,
    dDay: g.babyDays !== null ? formatDDay(g.babyDays) : null,
    assets: g.assets.map((a) => ({
      id: a.id,
      publicNo: a.publicNo,
      status: a.status,
      kind: a.kind,
      urls: a.urls,
      ts: a.ts,
      durationMs: a.durationMs,
    })),
  }))

  const utcDayKey = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  // 모델 B — 스토리는 entryDate 가 아니라 "안에 든 사진이 찍힌 날(takenAt)"마다
  // 등장한다. 사진별 날짜로 흩뿌려 같은 날 그리드 위에 얹는다. 카드 대표 썸네일은
  // (어느 날 버킷이든) 스토리의 첫 사진 1장.
  const dayOfAsset = (a: { takenAt: Date; createdAt: Date }): string =>
    utcDayKey(sortMode === 'uploaded' ? a.createdAt : a.takenAt)
  // dateKey -> (storyId -> StoryCardData). 같은 날 같은 스토리는 1장(중복 방지).
  const storiesByDate = new Map<string, Map<string, StoryCardData>>()
  for (const it of storyItems) {
    if (it.kind !== 'story') continue
    const e = it.entry
    const days = new Set(e.assets.flatMap((ea) => (ea.asset ? [dayOfAsset(ea.asset)] : [])))
    for (const dk of days) {
      const dayMap = storiesByDate.get(dk) ?? new Map<string, StoryCardData>()
      if (!dayMap.has(e.id)) dayMap.set(e.id, storyCardDataFromEntry(e))
      storiesByDate.set(dk, dayMap)
    }
  }
  const mainGroups = groups.map((g) => ({
    ...g,
    stories: Array.from(storiesByDate.get(g.dateKey)?.values() ?? []),
  }))

  // 멀티셀렉트 바 게이팅: 삭제 권한 / 앨범에 추가(앨범 권한 + 일반가족 앨범숨김 아님).
  const isManager = viewerRole === 'owner' || viewerRole === 'guardian'
  const navHidden = isManager
    ? []
    : await getSetting('nav.family.hidden', z.array(z.string()), [], prismaPublic)
  // 멀티셀렉트 삭제는 남의 사진도 포함될 수 있어 관리자급(delete.any)만 — 일반 가족은 숨김.
  const canDeleteSelection = ctx.capabilities.includes('asset.delete.any')
  const canAddAlbum = ctx.capabilities.includes('album.create') && !navHidden.includes('albums')

  // 날짜 필터 모드(캘린더에서 진입): 그 날의 스토리(일기)와 사진을 보여준다.
  // 컴포저는 숨기고, 헤더에 날짜·요일·카운트 + 캘린더로 돌아가는 좌측 버튼.
  if (dateFilter) {
    const dateObj = new Date(`${dateFilter}T00:00:00.000Z`)
    const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
    const headerTitle = `${dateObj.getUTCMonth() + 1}월 ${dateObj.getUTCDate()}일`
    const weekdayLabel = WEEKDAYS_KO[dateObj.getUTCDay()] ?? ''
    const photoCount = assetItems.length
    const storyCount = storyItems.length
    const countParts = [
      photoCount > 0 ? `사진 ${photoCount}` : null,
      storyCount > 0 ? `스토리 ${storyCount}` : null,
    ].filter((s): s is string => Boolean(s))
    const subtitle = [weekdayLabel, ...countParts].filter(Boolean).join(' · ')
    const isEmpty = photoCount === 0 && storyCount === 0
    return (
      <>
        <AppHeader
          title={headerTitle}
          subtitle={subtitle}
          left={
            <Link
              href="/calendar"
              className="-ml-1.5 flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-point-600 transition hover:bg-base-100 dark:text-point-400 dark:hover:bg-base-800"
              aria-label="캘린더로 돌아가기"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
              <span>캘린더로</span>
            </Link>
          }
          wide
        />
        {storyItems.length > 0 && (
          <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-4">
            <StoryStrip
              stories={storyItems.flatMap((it) =>
                it.kind === 'story' ? [storyCardDataFromEntry(it.entry)] : [],
              )}
            />
          </div>
        )}
        {isEmpty ? (
          <div className="mx-auto max-w-3xl px-5 py-16 text-center text-sm text-base-400">
            이 날짜에 올린 게 없어요.
          </div>
        ) : photoCount > 0 ? (
          <TimelineGrid
            initialGroups={groups}
            canDeleteSelection={canDeleteSelection}
            canAddAlbum={canAddAlbum}
            sort={sortMode}
          />
        ) : null}
      </>
    )
  }

  const features = await getFeatureFlags(prismaPublic)

  // "여기까지 봤어요" 디바이더 기준점. ctx.membership.lastSeenAt 의 OLD 값을
  // 캡쳐한 뒤 touchLastSeen 으로 NOW() 를 찍는다 — 다음 방문 때부터 갱신된
  // 시각이 기준이 된다. 캘린더(date filter)에서는 호출 안 함.
  const prevLastSeenAt = ctx.membership?.lastSeenAt ?? null
  if (ctx.membership) {
    await touchLastSeen(
      { id: ctx.membership.id, familyId: ctx.membership.familyId, userId: ctx.membership.userId },
      prismaPublic,
    )
  }
  const canUpload = ctx.capabilities.includes('asset.upload')

  // 오늘 추억 — 날짜 필터가 없는 기본 타임라인에서만 상단 카드로.
  const memoryGroups = await listMemories(
    { familyId: ctx.family.id, today: new Date(), viewerRole },
    prismaMedia,
    prismaPublic,
    getMediaClient(),
  )

  // 사람·추억 진입점 알림 점 — 전체 개수가 아니라 "새로 확인할 게 있을 때만". 사람은
  // 아직 이름 안 붙인(새로 잡힌) 사람이 있을 때, 추억은 오늘 해당 추억이 있을 때.
  const hasNewPeople = features.faces
    ? await hasUnnamedPerson({ familyId: ctx.family.id }, prismaMedia)
    : false
  const hasMemoryToday = memoryGroups.length > 0

  return (
    <>
      <PullToRefresh />
      {baby ? (
        <AppHeader
          title={ctx.family.name}
          subtitle={babySubtitle ?? baby.name}
          switchHref="/__bebe/switch"
          wide
        />
      ) : (
        <AppHeader title={ctx.family.name} switchHref="/__bebe/switch" wide />
      )}
      {/* 정렬 토글 같은 줄 오른쪽에 추억·사람 아이콘 진입점 — 상단 공간 최소화(사용자 요청).
          오늘 해당 추억이 있을 때만 아래에 풍부한 추억 카드를 노출. */}
      <TimelineSortToggle
        value={sortMode}
        right={
          <>
            <Link
              href="/memories"
              aria-label={hasMemoryToday ? '추억 (새 추억)' : '추억'}
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-base-100 text-base-600 transition hover:bg-base-200 active:scale-95 dark:bg-base-800 dark:text-base-300"
            >
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
              {hasMemoryToday && (
                <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-point-500 ring-2 ring-base-50 dark:ring-base-900" />
              )}
            </Link>
            {features.faces && (
              <Link
                href="/people"
                aria-label={hasNewPeople ? '사람 (새 사람)' : '사람'}
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-base-100 text-base-600 transition hover:bg-base-200 active:scale-95 dark:bg-base-800 dark:text-base-300"
              >
                <UsersRound className="h-[18px] w-[18px]" strokeWidth={2} />
                {hasNewPeople && (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-point-500 ring-2 ring-base-50 dark:ring-base-900" />
                )}
              </Link>
            )}
          </>
        }
      />
      {memoryGroups.length > 0 && memoryGroups[0] && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-3">
          <MemoriesCard group={memoryGroups[0]} />
        </div>
      )}
      {features.diary && ctx.capabilities.includes('record.create') && (
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
      {/* 스토리(모델 B)는 안에 든 사진이 찍힌 날짜 그룹마다 그 날 사진 위에
          얹혀 보인다(아래 TimelineGrid → BucketSection 의 StoryStrip). */}
      <TimelineGrid
        initialGroups={mainGroups}
        lastSeenAt={prevLastSeenAt}
        canUpload={canUpload}
        canDeleteSelection={canDeleteSelection}
        canAddAlbum={canAddAlbum}
        sort={sortMode}
      />
    </>
  )
}
