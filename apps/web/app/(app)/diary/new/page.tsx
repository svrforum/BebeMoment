import { DiaryForm } from '@/components/diary/DiaryForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'
import { createDiaryAction } from './actions'

export default async function NewDiaryPage() {
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
      <AppHeader title="스토리 쓰기" />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <DiaryForm action={createDiaryAction} babies={babies} availableAssets={pickerAssets} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
