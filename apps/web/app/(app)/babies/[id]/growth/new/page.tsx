import { GrowthForm } from '@/components/growth/GrowthForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { getTranslations } from 'next-intl/server'
import { createGrowthAction } from './actions'

export default async function NewGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('family')
  const { id } = await params
  return (
    <>
      <AppHeader title={t('babies.addGrowthTitle')} />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <GrowthForm action={createGrowthAction.bind(null, id)} />
          </CardBody>
        </Card>
      </div>
    </>
  )
}
