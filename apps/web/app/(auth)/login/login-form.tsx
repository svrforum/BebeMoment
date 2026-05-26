'use client'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type Props = {
  oidcProviders: { id: string; name: string }[]
  passwordEnabled: boolean
}

export function LoginForm({ oidcProviders, passwordEnabled }: Props) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '로그인 실패')
      setSubmitting(false)
      return
    }
    window.location.replace('/')
  }

  return (
    <div className="space-y-6">
      {passwordEnabled && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-xs font-medium text-base-500">
              아이디 또는 이메일
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
              placeholder="아이디 또는 name@example.com"
              className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-base-500">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 pr-12 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? '비밀번호 가리기' : '비밀번호 보기'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-base-500 hover:text-base-900 dark:hover:text-base-100"
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? '로그인하는 중…' : '로그인'}
          </Button>
        </form>
      )}
      {oidcProviders.length > 0 && (
        <>
          {passwordEnabled && (
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
              <span className="mx-3 text-xs text-base-400">또는</span>
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
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
      <p className="text-center text-sm text-base-500">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="font-semibold text-point-500">
          가입하기
        </Link>
      </p>
    </div>
  )
}
