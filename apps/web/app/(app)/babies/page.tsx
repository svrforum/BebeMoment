import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function BabiesPage() {
  const t = await getTranslations('family')
  const ctx = await getContext()
  if (!ctx.family) return null

  const babies = await prismaPublic.baby.findMany({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
  })

  return (
    <>
      <AppHeader
        title={t('babies.title')}
        right={
          <Button asChild size="sm" variant="secondary">
            <Link href="/babies/new">{t('babies.add')}</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
        {babies.length === 0 && (
          <p className="text-sm text-base-500">
            {t('babies.empty')}{' '}
            <Link href="/babies/new" className="text-point-500">
              {t('babies.addLink')}
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
