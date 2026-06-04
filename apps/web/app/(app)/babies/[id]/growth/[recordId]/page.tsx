import { GrowthForm } from '@/components/growth/GrowthForm'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { deleteGrowthAction, updateGrowthAction } from './actions'

export default async function EditGrowthPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>
}) {
  const t = await getTranslations('family')
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id, recordId } = await params
  const rec = await prismaPublic.growthRecord.findFirst({
    where: { id: recordId, familyId: ctx.family.id, babyId: id, deletedAt: null },
  })
  if (!rec) notFound()

  return (
    <>
      <AppHeader title={t('babies.editGrowthTitle')} />
      <div className="mx-auto max-w-sm space-y-3 px-5 py-6">
        <Card>
          <CardBody>
            <GrowthForm
              action={updateGrowthAction.bind(null, id, recordId)}
              submitLabel={t('babies.edit')}
              defaults={{
                measuredAt: rec.measuredAt.toISOString().slice(0, 10),
                heightCm: rec.heightCm != null ? Number(rec.heightCm) : null,
                weightKg: rec.weightKg != null ? Number(rec.weightKg) : null,
                headCm: rec.headCm != null ? Number(rec.headCm) : null,
                note: rec.note,
              }}
            />
          </CardBody>
        </Card>
        <form action={deleteGrowthAction.bind(null, id, recordId)}>
          <Button type="submit" variant="danger" className="w-full">
            {t('babies.delete')}
          </Button>
        </form>
      </div>
    </>
  )
}
