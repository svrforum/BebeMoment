import { MilestoneForm } from '@/components/milestone/MilestoneForm'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { getPreset } from '@bebe/core'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { deleteMilestoneAction, updateMilestoneAction } from './actions'

export default async function EditMilestonePage({
  params,
}: {
  params: Promise<{ id: string; msId: string }>
}) {
  const t = await getTranslations('family')
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
  const urlsMap = assets.length
    ? await getMediaClient().getAssetUrlsBatch(
        ctx.family.id,
        assets.map((a) => a.id),
      )
    : {}
  const pickerAssets = assets.map((a) => ({
    id: a.id,
    urls: urlsMap[a.id] ?? null,
  }))

  return (
    <>
      <AppHeader title={preset ? preset.labelKo : (ms.customLabel ?? t('babies.milestones'))} />
      <div className="mx-auto max-w-sm space-y-3 px-5 py-6">
        <Card>
          <CardBody>
            <MilestoneForm
              action={updateMilestoneAction.bind(null, id, msId)}
              availableAssets={pickerAssets}
              {...(preset ? { preset } : {})}
              submitLabel={t('babies.edit')}
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
            {t('babies.delete')}
          </Button>
        </form>
      </div>
    </>
  )
}
