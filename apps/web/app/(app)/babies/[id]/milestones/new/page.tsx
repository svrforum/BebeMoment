import { MilestoneForm } from '@/components/milestone/MilestoneForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getPreset } from '@bebe/core'
import { notFound, redirect } from 'next/navigation'
import { createMilestoneAction } from './actions'

export default async function NewMilestonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ presetKey?: string }>
}) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id } = await params
  const sp = await searchParams
  const preset = sp.presetKey ? getPreset(sp.presetKey) : undefined
  if (sp.presetKey && !preset) notFound()
  const assets = await prisma.asset.findMany({
    where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
    orderBy: { takenAt: 'desc' },
    take: 200,
  })
  return (
    <>
      <AppHeader title={preset ? preset.labelKo : '커스텀 마일스톤'} />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <MilestoneForm
              action={createMilestoneAction.bind(null, id)}
              availableAssets={assets}
              {...(preset ? { preset } : {})}
            />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
