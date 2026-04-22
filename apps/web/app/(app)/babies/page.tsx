import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import Link from 'next/link'

export default async function BabiesPage() {
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return null

  const babies = await prisma.baby.findMany({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
  })

  return (
    <>
      <AppHeader
        title="아기"
        right={
          <Button asChild size="sm" variant="secondary">
            <Link href="/babies/new">추가</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
        {babies.length === 0 && (
          <p className="text-sm text-base-500">
            아기가 없어요.{' '}
            <Link href="/babies/new" className="text-point-500">
              추가하기
            </Link>
          </p>
        )}
        {babies.map((b) => (
          <Link key={b.id} href={`/babies/${b.id}`} className="block">
            <Card>
              <CardBody>
                <div className="font-semibold">{b.name}</div>
                <div className="text-sm text-base-500 tabular-nums">
                  {b.birthDate.toISOString().slice(0, 10)}
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
