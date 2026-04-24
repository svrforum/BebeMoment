import { GrowthChartLazy } from '@/components/growth/GrowthChartLazy'
import { GrowthList } from '@/components/growth/GrowthList'
import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { listGrowthByBaby } from '@/server/growth/list-by-baby'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export default async function GrowthListPage({ params }: { params: Promise<{ id: string }> }) {
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
  const records = await listGrowthByBaby(ctx.family.id, baby.id, prismaPublic)

  return (
    <>
      <AppHeader title="성장 기록" />
      <div className="mx-auto max-w-md space-y-4 px-5 py-4">
        <GrowthChartLazy records={records} />
        <GrowthList records={records} babyId={baby.id} />
        <Button asChild className="w-full">
          <Link href={`/babies/${baby.id}/growth/new`}>기록 추가</Link>
        </Button>
      </div>
    </>
  )
}
