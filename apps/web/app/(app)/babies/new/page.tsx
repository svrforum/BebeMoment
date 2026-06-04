import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { getTranslations } from 'next-intl/server'
import { createBabyAction } from './actions'

export default async function NewBabyPage() {
  const t = await getTranslations('family')
  return (
    <>
      <AppHeader title={t('babies.addTitle')} />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <form action={createBabyAction} className="space-y-3">
              <div>
                <Label htmlFor="name">{t('babies.name')}</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="birthDate">{t('babies.birthDate')}</Label>
                <Input id="birthDate" name="birthDate" type="date" required />
              </div>
              <Button type="submit" className="w-full">
                {t('babies.add')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
