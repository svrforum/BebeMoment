import { AppHeader } from '@/components/shell/app-header'
import { DiaryCard } from '@/components/timeline/diary-card'
import { TagFilterStrip } from '@/components/timeline/tag-filter-strip'
import { TimelineComposer } from '@/components/timeline/timeline-composer'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { groupAssetsByBucket } from '@/server/asset/group-by-bucket'
import { getContext } from '@/server/context'
import { listTimeline } from '@/server/timeline/merged-list'

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>
}) {
  const ctx = await getContext()
  if (!ctx.family) return null
  const { tag } = await searchParams
  const tagSlugs = Array.isArray(tag) ? tag : tag ? [tag] : []

  const viewerRole = ctx.membership?.role ?? 'family'
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
        ...(tagSlugs.length > 0 ? { tagSlugs } : {}),
      },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])
  const birthDate = baby?.birthDate ?? new Date()

  const assetItems = items.filter((it) => it.kind === 'asset')
  const diaryItems = items.filter((it) => it.kind === 'journal')

  const groups = groupAssetsByBucket(
    assetItems.map((it) => {
      const a = it.kind === 'asset' ? it.asset : null
      if (!a) throw new Error('unreachable')
      return {
        id: a.id,
        takenAt: a.takenAt,
        status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
        kind: a.kind as 'image' | 'video',
        urls: a.urls,
      }
    }),
    birthDate,
  )

  return (
    <>
      {baby ? (
        <AppHeader title={ctx.family.name} subtitle={baby.name} wide />
      ) : (
        <AppHeader title={ctx.family.name} wide />
      )}
      <TagFilterStrip familyId={ctx.family.id} prismaPublic={prismaPublic} activeSlugs={tagSlugs} />
      {tagSlugs.length === 0 && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-3">
          <TimelineComposer
            userDisplayName={ctx.user?.displayName ?? '나'}
            userAvatarPath={ctx.user?.avatarPath ?? null}
            babyId={baby?.id ?? null}
            viewerRole={viewerRole}
          />
        </div>
      )}
      {diaryItems.length > 0 && (
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 pt-4 space-y-3">
          {diaryItems.map((it) => {
            if (it.kind !== 'journal') return null
            return <DiaryCard key={`j-${it.id}`} entry={it.entry} />
          })}
        </div>
      )}
      <TimelineGrid initialGroups={groups} />
    </>
  )
}
