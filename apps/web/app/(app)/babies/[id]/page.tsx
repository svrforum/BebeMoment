import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export default async function BabyDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
                <div className="font-medium">성장 기록</div>
                <div className="text-xs text-base-500">키 · 몸무게 · 머리둘레</div>
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
                <div className="font-medium">마일스톤</div>
                <div className="text-xs text-base-500">발달 체크리스트</div>
              </div>
              <span aria-hidden>›</span>
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
