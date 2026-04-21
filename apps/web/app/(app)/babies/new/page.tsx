import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { createBabyAction } from './actions'

export default function NewBabyPage() {
  return (
    <>
      <AppHeader title="아기 추가" />
      <div className="mx-auto max-w-sm px-5 py-6">
        <Card>
          <CardBody>
            <form action={createBabyAction} className="space-y-3">
              <div>
                <Label htmlFor="name">이름</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="birthDate">생년월일</Label>
                <Input id="birthDate" name="birthDate" type="date" required />
              </div>
              <Button type="submit" className="w-full">
                추가
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
