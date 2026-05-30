import { AppHeader } from '@/components/shell/app-header'
import { StoryStrip, type TimelineStory } from '@/components/timeline/bucket-section'
import { MemoriesEntry } from '@/components/memories/memories-entry'
import { MemoriesCard } from '@/components/timeline/memories-card'
import { StoryCard } from '@/components/timeline/story-card'
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
import { formatDDay, groupAssetsByDay } from '@/server/timeline/group-by-day'
import { listTimeline } from '@/server/timeline/merged-list'
import { ArrowLeft } from 'lucide-react'
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

  // 스토리를 날짜(entryDate)별로 묶어 같은 날 사진 그룹 위에 끼운다(1198). 사진이 있는
  // 날의 스토리는 해당 그룹에, 사진 없는 옛 스토리는 orphan 으로 상단에.
  const utcDayKey = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const storiesByDate = new Map<string, TimelineStory[]>()
  for (const it of storyItems) {
    if (it.kind !== 'story') continue
    const e = it.entry
    // 그룹과 같은 축으로 키를 잡아야 같은 날에 붙는다 — uploaded 정렬에선 사진 그룹이
    // createdAt 기준이므로 스토리도 createdAt(작성 시각)로. taken 정렬은 entryDate.
    const key = utcDayKey(sortMode === 'uploaded' ? e.createdAt : e.entryDate)
    const arr = storiesByDate.get(key) ?? []
    arr.push({
      id: e.id,
      publicNo: e.publicNo,
      title: e.title ?? null,
      body: e.body,
      mood: e.mood ?? null,
      visibility: e.visibility,
    })
    storiesByDate.set(key, arr)
  }
  const mainGroups = groups.map((g) => {
    const s = storiesByDate.get(g.dateKey)
    if (s) storiesByDate.delete(g.dateKey)
    return { ...g, stories: s ?? [] }
  })
  // 사진 그룹에 못 붙은(사진 없는 옛) 스토리만 상단에 따로.
  const storyKey = (e: { entryDate: Date; createdAt: Date }): string =>
    utcDayKey(sortMode === 'uploaded' ? e.createdAt : e.entryDate)
  const orphanStoryItems = storyItems.filter(
    (it) => it.kind === 'story' && storiesByDate.has(storyKey(it.entry)),
  )

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
                it.kind === 'story'
                  ? [
                      {
                        id: it.entry.id,
                        publicNo: it.entry.publicNo,
                        title: it.entry.title ?? null,
                        body: it.entry.body,
                        mood: it.entry.mood ?? null,
                        visibility: it.entry.visibility,
                      },
                    ]
                  : [],
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

  return (
    <>
      <PullToRefresh />
      {baby ? (
        <AppHeader title={ctx.family.name} subtitle={baby.name} wide />
      ) : (
        <AppHeader title={ctx.family.name} wide />
      )}
      {canUpload && <TimelineSortToggle value={sortMode} />}
      {/* 오늘 해당 추억이 있으면 풍부한 카드, 없으면 항상 보이는 슬림 진입점(→ /memories 보관함). */}
      <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-3">
        {memoryGroups.length > 0 && memoryGroups[0] ? (
          <MemoriesCard group={memoryGroups[0]} />
        ) : (
          <MemoriesEntry count={0} />
        )}
      </div>
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
      {/* 스토리는 이제 해당 날짜의 사진 그룹 위에 끼워 보여준다(아래 TimelineGrid).
          사진이 없어 그룹에 못 붙은 옛 스토리만 상단에 따로. */}
      {orphanStoryItems.length > 0 && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-4 space-y-2">
          {orphanStoryItems.map((it) =>
            it.kind === 'story' ? <StoryCard key={`j-${it.id}`} entry={it.entry} compact /> : null,
          )}
        </div>
      )}
      <TimelineGrid
        initialGroups={mainGroups}
        lastSeenAt={prevLastSeenAt}
        canUpload={canUpload}
        canDeleteSelection={canDeleteSelection}
        canAddAlbum={canAddAlbum}
      />
    </>
  )
}
