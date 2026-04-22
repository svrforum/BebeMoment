import { GrowthForm } from '@/components/growth/GrowthForm'
import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { createGrowthAction } from './actions'

export default async function NewGrowthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <AppHeader title="성장 기록 추가" />
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
