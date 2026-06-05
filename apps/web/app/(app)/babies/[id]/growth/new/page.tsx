import { GrowthForm } from '@/components/growth/GrowthForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { latestGrowth } from '@/server/growth/latest'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { createGrowthAction } from './actions'

export default async function NewGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('family')
  const { id } = await params

  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')

  const last = await latestGrowth(ctx.family.id, id, prismaPublic)
  const lastRecord = last
    ? {
        heightCm: last.heightCm != null ? Number(last.heightCm) : null,
        weightKg: last.weightKg != null ? Number(last.weightKg) : null,
        headCm: last.headCm != null ? Number(last.headCm) : null,
        measuredAt: last.measuredAt,
      }
    : null

  return (
    <>
      <AppHeader title={t('babies.addGrowthTitle')} />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <GrowthForm action={createGrowthAction.bind(null, id)} lastRecord={lastRecord} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
