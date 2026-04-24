'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { completeOnboarding } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? '만드는 중…' : '시작하기'}
    </Button>
  )
}

export default function OnboardingPage() {
  const [state, formAction] = useActionState(completeOnboarding, null)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-2">가족 만들기</h1>
      <p className="text-sm text-base-500 mb-6">첫 가족과 아기를 등록하면 타임라인이 시작돼요.</p>
      <Card>
        <CardBody>
          <form action={formAction} className="space-y-3">
            <div>
              <Label htmlFor="familyName">가족 이름</Label>
              <Input
                id="familyName"
                name="familyName"
                required
                minLength={1}
                maxLength={80}
                placeholder="예: 김씨네 가족"
              />
            </div>
            <div>
              <Label htmlFor="babyName">아기 이름</Label>
              <Input
                id="babyName"
                name="babyName"
                required
                minLength={1}
                maxLength={40}
                placeholder="예: 예준"
              />
            </div>
            <div>
              <Label htmlFor="birthDate">생년월일</Label>
              <Input id="birthDate" name="birthDate" type="date" required max={today} />
            </div>
            {state?.error && (
              <p className="text-sm text-danger" role="alert">
                {state.error}
              </p>
            )}
            <SubmitButton />
          </form>
        </CardBody>
      </Card>
    </main>
  )
}
