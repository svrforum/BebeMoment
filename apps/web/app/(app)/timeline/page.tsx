import { AppHeader } from '@/components/shell/app-header'
import { TimelineGrid } from '@/components/timeline/timeline-grid'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { groupAssetsByBucket } from '@/server/asset/group-by-bucket'
import { listAssets } from '@/server/asset/list'
import { resolveContext } from '@/server/context'

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

  const assets = await listAssets(
    { familyId: ctx.family.id, limit: 200, includeProcessing: true },
    prisma,
  )

  const groups = groupAssetsByBucket(
    assets.map((a) => ({
      id: a.id,
      takenAt: a.takenAt,
      status: a.status as 'uploading' | 'processing' | 'ready' | 'failed',
      kind: a.kind as 'image' | 'video',
      derivatives: (a.derivatives as Record<string, string> | null) ?? null,
    })),
    birthDate,
  )

  return (
    <>
      {baby ? (
        <AppHeader title={ctx.family.name} subtitle={baby.name} />
      ) : (
        <AppHeader title={ctx.family.name} />
      )}
      <TimelineGrid initialGroups={groups} />
    </>
  )
}
