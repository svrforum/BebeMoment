import { MilestoneForm } from '@/components/milestone/MilestoneForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { listMilestonePickerAssets } from '@/server/milestone/picker-assets'
import { getPreset } from '@bebe/core'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { createMilestoneAction } from './actions'

export default async function NewMilestonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ presetKey?: string }>
}) {
  const t = await getTranslations('family')
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  if (!ctx.capabilities.includes('record.read')) notFound()
  const { id } = await params
  const sp = await searchParams
  const preset = sp.presetKey ? getPreset(sp.presetKey) : undefined
  if (sp.presetKey && !preset) notFound()
  const pickerAssets = await listMilestonePickerAssets(
    { familyId: ctx.family.id, viewerRole: ctx.membership?.role ?? 'family' },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  return (
    <>
      <AppHeader title={preset ? preset.labelKo : t('babies.customMilestone')} />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <MilestoneForm
              action={createMilestoneAction.bind(null, id)}
              availableAssets={pickerAssets}
              {...(preset ? { preset } : {})}
            />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
