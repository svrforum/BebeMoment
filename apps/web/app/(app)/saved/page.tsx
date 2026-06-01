import { PeopleEntry } from '@/components/people/people-entry'
import { AppHeader } from '@/components/shell/app-header'
import {
  StoryCard,
  type StoryCardData,
  storyCardDataFromEntry,
} from '@/components/story/story-card'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { getContext } from '@/server/context'
import { countPeople } from '@/server/people/list'
import { getFeatureFlags } from '@/server/settings/features'
import { getSetting } from '@/server/settings/get'
import { listMyStoryBookmarks } from '@/server/story-bookmark/list-mine'
import { formatDDay, groupAssetsByDay } from '@/server/timeline/group-by-day'
import { Bookmark } from 'lucide-react'
import { redirect } from 'next/navigation'
import { z } from 'zod'

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default async function SavedPage() {
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const role = ctx.membership?.role ?? 'family'

  const [photos, stories, baby] = await Promise.all([
    listMyBookmarks(
      ctx.family.id,
      ctx.user.id,
      { limit: 100 },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
    listMyStoryBookmarks(
      ctx.family.id,
      ctx.user.id,
      role,
      { limit: 50 },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
    prismaPublic.baby.findFirst({
      where: { familyId: ctx.family.id, deletedAt: null },
      orderBy: { birthDate: 'asc' },
    }),
  ])
  const birthDate: Date | null = baby?.birthDate ?? null

  // 타임라인과 동일한 포맷: 촬영일(takenAt) 기준 일자 그룹 + 날짜/나이/D-day 헤더.
  const groups = groupAssetsByDay(
    photos.items.flatMap((b) => {
      const a = b.asset
      if (!a) return []
      return [
        {
          id: a.id,
          publicNo: a.publicNo,
          ts: a.takenAt ?? a.createdAt,
          status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
          kind: a.kind as 'image' | 'video',
          urls: a.urls,
          durationMs: a.durationMs ?? null,
        },
      ]
    }),
    birthDate,
  )

  // 북마크한 스토리도 타임라인처럼 같은 날짜 그룹 위에 끼운다. 사진 없는 날의 스토리는
  // orphan 으로 상단에 따로(최신순).
  const storyEntries = stories.items.flatMap((b) => (b.entry ? [b.entry] : []))
  const groupKeys = new Set(groups.map((g) => g.dateKey))
  const storiesByDate = new Map<string, StoryCardData[]>()
  for (const e of storyEntries) {
    const key = utcDayKey(e.entryDate)
    const arr = storiesByDate.get(key) ?? []
    arr.push(storyCardDataFromEntry(e))
    storiesByDate.set(key, arr)
  }
  const mainGroups = groups.map((g) => ({
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
    stories: storiesByDate.get(g.dateKey) ?? [],
  }))
  const orphanStories = storyEntries
    .filter((e) => !groupKeys.has(utcDayKey(e.entryDate)))
    .sort((a, b) => b.entryDate.getTime() - a.entryDate.getTime())

  // 멀티셀렉트 게이팅 — 타임라인과 동일 기준(삭제=delete.any, 앨범=album.create+비숨김).
  const isManager = role === 'owner' || role === 'guardian'
  const navHidden = isManager
    ? []
    : await getSetting('nav.family.hidden', z.array(z.string()), [], prismaPublic)
  const canDeleteSelection = ctx.capabilities.includes('asset.delete.any')
  const canAddAlbum = ctx.capabilities.includes('album.create') && !navHidden.includes('albums')

  const empty = mainGroups.length === 0 && orphanStories.length === 0

  // 사람(얼굴 인식) 진입점 — features.faces 켜졌을 때만. 북마크 탭에서도 사람으로 진입.
  const features = await getFeatureFlags(prismaPublic)
  const peopleCount = features.faces
    ? await countPeople({ familyId: ctx.family.id }, prismaMedia)
    : 0

  return (
    <>
      <AppHeader title="북마크" wide />
      {features.faces && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl xl:max-w-6xl px-5 pt-4">
          <PeopleEntry count={peopleCount} />
        </div>
      )}
      {empty ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
            <Bookmark className="h-10 w-10 text-base-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-base-900 dark:text-base-50">
              저장한 항목이 없어요
            </p>
            <p className="mt-1 text-sm text-base-500">
              사진이나 스토리의 북마크 아이콘을 누르면 여기에 모여요
            </p>
          </div>
        </div>
      ) : (
        <>
          {orphanStories.length > 0 && (
            <div className="mx-auto max-w-3xl lg:max-w-5xl xl:max-w-6xl px-5 pt-4 space-y-2">
              {orphanStories.map((e) => (
                <StoryCard key={`j-${e.id}`} data={storyCardDataFromEntry(e)} />
              ))}
            </div>
          )}
          {mainGroups.length > 0 && (
            <TimelineGrid
              initialGroups={mainGroups}
              canUpload={false}
              canDeleteSelection={canDeleteSelection}
              canAddAlbum={canAddAlbum}
            />
          )}
        </>
      )}
    </>
  )
}
