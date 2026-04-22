import { AppHeader } from '@/components/shell/app-header'
import { JournalCard } from '@/components/timeline/journal-card'
import { JournalFabLink } from '@/components/timeline/journal-fab-link'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { groupAssetsByBucket } from '@/server/asset/group-by-bucket'
import { resolveContext } from '@/server/context'
import { listTimeline } from '@/server/timeline/merged-list'

export default async function TimelinePage() {
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return null

  const baby = await prisma.baby.findFirst({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
  })
  const birthDate = baby?.birthDate ?? new Date()

  // P5 Task 17: merged timeline (assets + journal).
  // TODO(P5+): interleave journal entries into age buckets by entryDate.
  // For now: assets render in existing bucket grid; journal entries render
  // as a separate descending feed above.
  const { items } = await listTimeline(ctx.family.id, { limit: 100 }, prisma)

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
        derivatives: (a.derivatives as Record<string, string> | null) ?? null,
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
      <JournalFabLink />
    </>
  )
}
