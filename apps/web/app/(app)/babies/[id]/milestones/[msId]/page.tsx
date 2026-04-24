import { MilestoneForm } from '@/components/milestone/MilestoneForm'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getPreset } from '@bebe/core'
import { notFound, redirect } from 'next/navigation'
import { deleteMilestoneAction, updateMilestoneAction } from './actions'

export default async function EditMilestonePage({
  params,
}: { params: Promise<{ id: string; msId: string }> }) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id, msId } = await params
  const ms = await prismaPublic.milestone.findFirst({
    where: { id: msId, familyId: ctx.family.id, babyId: id, deletedAt: null },
    include: { assets: true },
  })
  if (!ms) notFound()
  const preset = ms.presetKey ? getPreset(ms.presetKey) : undefined
  const assets = await prismaMedia.asset.findMany({
    where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
    orderBy: { takenAt: 'desc' },
    take: 200,
  })

  return (
    <>
      <AppHeader title={preset ? preset.labelKo : (ms.customLabel ?? '마일스톤')} />
      <div className="mx-auto max-w-sm space-y-3 px-5 py-6">
        <Card>
          <CardBody>
            <MilestoneForm
              action={updateMilestoneAction.bind(null, id, msId)}
              availableAssets={assets}
              {...(preset ? { preset } : {})}
              submitLabel="수정"
              defaults={{
                achievedAt: ms.achievedAt.toISOString().slice(0, 10),
                note: ms.note,
                assetIds: ms.assets.map((a) => a.assetId),
                customLabel: ms.customLabel,
              }}
            />
          </CardBody>
        </Card>
        <form action={deleteMilestoneAction.bind(null, id, msId)}>
          <Button type="submit" variant="danger" className="w-full">
            삭제
          </Button>
        </form>
      </div>
    </>
  )
}
