import { JournalForm } from '@/components/journal/JournalForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'
import { createJournalAction } from './actions'

export default async function NewJournalPage() {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')

  const [babies, assets] = await Promise.all([
    prismaPublic.baby.findMany({
      where: { familyId: ctx.family.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { birthDate: 'asc' },
    }),
    prismaMedia.asset.findMany({
      where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
      orderBy: { takenAt: 'desc' },
      take: 200,
    }),
  ])

  return (
    <>
      <AppHeader title="일기 쓰기" />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <JournalForm action={createJournalAction} babies={babies} availableAssets={assets} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
