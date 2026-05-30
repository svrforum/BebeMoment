import { AppHeader } from '@/components/shell/app-header'
import { AssetCard } from '@/components/timeline/asset-card'
import { StoryCard } from '@/components/timeline/story-card'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { getContext } from '@/server/context'
import { listMyStoryBookmarks } from '@/server/story-bookmark/list-mine'
import { Bookmark } from 'lucide-react'
import { redirect } from 'next/navigation'

function dateOf(...candidates: (Date | string | null | undefined)[]): number {
  for (const c of candidates) {
    if (c) return new Date(c).getTime()
  }
  return 0
}

export default async function SavedPage() {
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) redirect('/onboarding')
  const role = ctx.membership?.role ?? 'family'

  const [photos, stories] = await Promise.all([
    listMyBookmarks(
      ctx.family.id,
      ctx.user.id,
      { limit: 60 },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
    listMyStoryBookmarks(
      ctx.family.id,
      ctx.user.id,
      role,
      { limit: 30 },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])

  // 타임라인과 동일하게 날짜(사진 촬영일 / 스토리 날짜) 내림차순 정렬. 북마크 목록은
  // 기본적으로 '북마크한 시각' 순이라 타임라인과 어긋나 보였다.
  const photoItems = photos.items
    .filter((b) => b.asset)
    .sort(
      (a, b) =>
        dateOf(a.asset?.takenAt, a.asset?.createdAt) - dateOf(b.asset?.takenAt, b.asset?.createdAt),
    )
    .reverse()
  const storyItems = stories.items
    .filter((b) => b.entry)
    .sort((a, b) => dateOf(a.entry?.entryDate) - dateOf(b.entry?.entryDate))
    .reverse()

  const hasPhotos = photoItems.length > 0
  const hasStory = storyItems.length > 0
  const empty = !hasPhotos && !hasStory

  return (
    <>
      <AppHeader title="북마크" />
      <div className="mx-auto max-w-3xl space-y-8 px-5 py-4">
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
            {hasPhotos && (
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-base-500 dark:text-base-400">
                  저장한 사진
                </h2>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {photoItems.map((b) => {
                    if (!b.asset) return null
                    return (
                      <AssetCard
                        key={b.assetId}
                        id={b.assetId}
                        publicNo={b.asset.publicNo}
                        urls={b.asset.urls}
                        status={b.asset.status}
                        kind={b.asset.kind}
                      />
                    )
                  })}
                </div>
              </section>
            )}
            {hasStory && (
              <section>
                <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-base-500 dark:text-base-400">
                  저장한 스토리
                </h2>
                <div className="space-y-3">
                  {storyItems.map((b) => {
                    if (!b.entry) return null
                    return <StoryCard key={b.entryId} entry={b.entry} />
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
