'use client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Props = {
  oidcProviders: { id: string; name: string }[]
  passwordEnabled: boolean
}

export function LoginForm({ oidcProviders, passwordEnabled }: Props) {
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
    <Card>
      <CardBody className="space-y-4">
        {passwordEnabled && (
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
          </form>
        )}
        {oidcProviders.length > 0 && (
          <>
            {passwordEnabled && (
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-base-200" />
                <span className="mx-3 text-xs text-base-400">또는</span>
                <div className="flex-grow border-t border-base-200" />
              </div>
            )}
            <div className="space-y-2">
              {oidcProviders.map((p) => (
                <Button key={p.id} asChild variant="secondary" size="lg" className="w-full">
                  <a href={`/api/auth/oidc/${p.id}`}>{p.name} 으로 로그인</a>
                </Button>
              ))}
            </div>
          </>
        )}
        <p className="text-sm text-center pt-2 text-base-500">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-point-500 font-medium">
            가입하기
          </Link>
        </p>
      </CardBody>
    </Card>
  )
}
