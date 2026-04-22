import { JournalDetail } from '@/components/journal/JournalDetail'
import { JournalForm } from '@/components/journal/JournalForm'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getJournalEntry } from '@/server/journal/get'
import { notFound, redirect } from 'next/navigation'
import { deleteJournalAction, updateJournalAction } from './actions'

export default async function JournalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
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
  const entry = await getJournalEntry(id, ctx.family.id, prisma)
  if (!entry) notFound()

  if (sp.edit === '1') {
    const [babies, assets] = await Promise.all([
      prisma.baby.findMany({
        where: { familyId: ctx.family.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { birthDate: 'asc' },
      }),
      prisma.asset.findMany({
        where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
        orderBy: { takenAt: 'desc' },
        take: 200,
      }),
    ])
    return (
      <>
        <AppHeader title="일기 편집" />
        <div className="mx-auto max-w-sm space-y-3 px-5 py-6">
          <Card>
            <CardBody>
              <JournalForm
                action={updateJournalAction.bind(null, id)}
                babies={babies}
                availableAssets={assets}
                submitLabel="수정"
                defaults={{
                  babyId: entry.babyId,
                  entryDate: entry.entryDate.toISOString().slice(0, 10),
                  title: entry.title,
                  body: entry.body,
                  mood: entry.mood,
                  assetIds: entry.assets.map((a) => a.assetId),
                }}
              />
            </CardBody>
          </Card>
          <form action={deleteJournalAction.bind(null, id)}>
            <Button type="submit" variant="danger" className="w-full">
              삭제
            </Button>
          </form>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader
        title={entry.title ?? '일기'}
        right={
          <a href={`/journal/${id}?edit=1`} className="text-sm text-point-500">
            편집
          </a>
        }
      />
      <div className="mx-auto max-w-md px-5 py-4">
        <JournalDetail entry={entry} />
      </div>
    </>
  )
}
