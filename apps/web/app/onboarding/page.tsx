import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { getAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { completeOnboarding } from './actions'

export default async function OnboardingPage() {
  const { user } = await getAuth()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">가족 만들기</h1>
      <p className="text-sm text-base-500 mb-6">첫 가족과 아기를 등록하면 타임라인이 시작돼요.</p>
      <Card>
        <CardBody>
          <form action={completeOnboarding} className="space-y-3">
            <div>
              <Label htmlFor="familyName">가족 이름</Label>
              <Input id="familyName" name="familyName" required placeholder="예: 김씨네 가족" />
            </div>
            <div>
              <Label htmlFor="babyName">아기 이름</Label>
              <Input id="babyName" name="babyName" required placeholder="예: 예준" />
            </div>
            <div>
              <Label htmlFor="birthDate">생년월일</Label>
              <Input id="birthDate" name="birthDate" type="date" required />
            </div>
            <Button type="submit" size="lg" className="w-full">
              시작하기
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}
