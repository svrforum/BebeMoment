import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export default async function BabyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('family')
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id } = await params
  const baby = await prismaPublic.baby.findFirst({
    where: { id, familyId: ctx.family.id, deletedAt: null },
  })
  if (!baby) notFound()

  return (
    <>
      <AppHeader title={baby.name} />
      <div className="mx-auto max-w-md space-y-3 px-5 py-4">
        <Card>
          <CardBody>
            <Link
              href={`/babies/${baby.id}/growth`}
              className="flex items-center justify-between py-1"
            >
              <div>
                <div className="font-medium">{t('babies.growth')}</div>
                <div className="text-xs text-base-500">{t('babies.growthSubtitle')}</div>
              </div>
              <span aria-hidden>›</span>
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Link
              href={`/babies/${baby.id}/milestones`}
              className="flex items-center justify-between py-1"
            >
              <div>
                <div className="font-medium">{t('babies.milestones')}</div>
                <div className="text-xs text-base-500">{t('babies.milestonesSubtitle')}</div>
              </div>
              <span aria-hidden>›</span>
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
