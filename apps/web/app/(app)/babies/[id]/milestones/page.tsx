import { MilestoneChecklist } from '@/components/milestone/MilestoneChecklist'
import { AppHeader } from '@/components/shell/app-header'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { listMilestonesByBaby } from '@/server/milestone/list-by-baby'
import { presetsAvailable } from '@/server/milestone/presets-available'
import { getPreset } from '@bebe/core'
import { notFound, redirect } from 'next/navigation'

export default async function MilestonesPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id } = await params
  const baby = await prisma.baby.findFirst({
    where: { id, familyId: ctx.family.id, deletedAt: null },
  })
  if (!baby) notFound()

  const presets = await presetsAvailable(ctx.family.id, baby.id, prisma)
  const milestones = await listMilestonesByBaby(ctx.family.id, baby.id, prisma)
  const achieved = milestones.map((m) => ({
    id: m.id,
    labelKo: m.presetKey
      ? (getPreset(m.presetKey)?.labelKo ?? m.presetKey)
      : (m.customLabel ?? '마일스톤'),
    achievedAt: m.achievedAt,
    presetKey: m.presetKey,
  }))

  return (
    <>
      <AppHeader title="마일스톤" />
      <div className="mx-auto max-w-md space-y-4 px-5 py-4">
        <MilestoneChecklist presets={presets} achieved={achieved} babyId={baby.id} />
      </div>
    </>
  )
}
