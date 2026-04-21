'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '로그인 실패')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        bebe-<span className="text-point-500">moment</span>
      </h1>
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-3">
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
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? '…' : '로그인'}
            </Button>
            <p className="text-sm text-center pt-2 text-base-500">
              계정이 없으신가요?{' '}
              <Link href="/signup" className="text-point-500 font-medium">
                가입하기
              </Link>
            </p>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}
