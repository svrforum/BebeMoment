import { AppHeader } from '@/components/shell/app-header'
import { JournalCard } from '@/components/timeline/journal-card'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { groupAssetsByBucket } from '@/server/asset/group-by-bucket'
import { getContext } from '@/server/context'
import { listTimeline } from '@/server/timeline/merged-list'

export default async function TimelinePage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const [baby, { items }] = await Promise.all([
    prismaPublic.baby.findFirst({
      where: { familyId: ctx.family.id, deletedAt: null },
      orderBy: { birthDate: 'asc' },
    }),
    listTimeline(ctx.family.id, { limit: 100 }, prismaPublic, prismaMedia, getMediaClient()),
  ])
  const birthDate = baby?.birthDate ?? new Date()

  const assetItems = items.filter((it) => it.kind === 'asset')
  const journalItems = items.filter((it) => it.kind === 'journal')

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
        <AppHeader title={ctx.family.name} subtitle={baby.name} />
      ) : (
        <AppHeader title={ctx.family.name} />
      )}
      {journalItems.length > 0 && (
        <div className="mx-auto max-w-3xl px-5 pt-4 space-y-3">
          {journalItems.map((it) => {
            if (it.kind !== 'journal') return null
            return <JournalCard key={`j-${it.id}`} entry={it.entry} />
          })}
        </div>
      )}
      <TimelineGrid initialGroups={groups} />
    </>
  )
}
