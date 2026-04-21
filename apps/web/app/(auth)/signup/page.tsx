'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const prefilledEmail = params.get('email') ?? ''

  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '가입 실패')
      return
    }
    if (inviteToken) {
      await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken }),
      })
      router.push('/')
    } else {
      router.push('/onboarding')
    }
    router.refresh()
  }

  return (
    <Card>
      <CardBody>
        {inviteToken && (
          <p className="text-sm text-base-500 mb-3">
            초대 링크로 가입하시는군요. 가입이 끝나면 자동으로 가족에 합류돼요.
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="displayName">이름</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">비밀번호 (8자 이상)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? '…' : '가입하기'}
          </Button>
          <p className="text-sm text-center pt-2 text-base-500">
            계정이 있으신가요?{' '}
            <Link href="/login" className="text-point-500 font-medium">
              로그인
            </Link>
          </p>
        </form>
      </CardBody>
    </Card>
  )
}

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-8">가입하기</h1>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  )
}
