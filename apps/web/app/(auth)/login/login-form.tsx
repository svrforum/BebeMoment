'use client'
import { SnsButton } from '@/components/auth/sns-brand'
import { Button } from '@/components/ui/button'
import { oidcLoginErrorKey } from '@/lib/oidc-login-error'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Props = {
  oidcProviders: { id: string; name: string }[]
  passwordEnabled: boolean
}

// 로그인 후 돌아갈 경로. open-redirect 방지: 첫 글자가 '/' 이고 그 다음이 '/'·'\\' 가 아닌
// 같은-출처 절대경로만 허용(`//evil`·`/\evil` 같은 프로토콜-상대/백슬래시 우회 차단).
function safeNext(): string {
  if (typeof window === 'undefined') return '/'
  const p = new URLSearchParams(window.location.search).get('next')
  if (p && /^\/(?![/\\])/.test(p)) return p
  return '/'
}

export function LoginForm({ oidcProviders, passwordEnabled }: Props) {
  const t = useTranslations('auth')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // OIDC 콜백/시작 라우트가 실패 시 `/login?error=<code>` 로 되돌린다 — 그 코드를 사람이
  // 읽을 메시지로 보여줘 조용한 실패(빈 로그인 화면)를 없앤다. (읽기 client-side:
  // searchParams-only 네비게이션 캐시 이슈 회피 — [[next-searchparams-client-cache]].)
  const [oidcError, setOidcError] = useState<string | null>(null)
  // OIDC(카카오 등) 로그인도 로그인 후 원래 보려던 곳으로 복귀하도록 next 를 실어 보낸다
  // (비번 로그인은 safeNext 가 처리). 마운트 후 URL 의 next 를 읽어 쿼리스트링으로.
  const [nextQuery, setNextQuery] = useState('')
  useEffect(() => {
    const n = safeNext()
    setNextQuery(n !== '/' ? `?next=${encodeURIComponent(n)}` : '')
    const key = oidcLoginErrorKey(new URLSearchParams(window.location.search).get('error'))
    if (key) setOidcError(t(`login.error.${key}`))
  }, [t])

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
      setError(data.error ?? t('login.failed'))
      setSubmitting(false)
      return
    }
    window.location.replace(safeNext())
  }

  return (
    <div className="space-y-6">
      {oidcError && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {oidcError}
        </p>
      )}
      {passwordEnabled && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-xs font-medium text-base-500">
              {t('login.identifierLabel')}
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
              placeholder={t('login.identifierPlaceholder')}
              className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-base-500">
              {t('login.passwordLabel')}
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
                aria-label={showPw ? t('password.hide') : t('password.show')}
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
            {submitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      )}
      {oidcProviders.length > 0 && (
        <>
          {passwordEnabled && (
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
              <span className="mx-3 text-xs text-base-400">{t('login.or')}</span>
              <div className="flex-grow border-t border-base-200 dark:border-base-800" />
            </div>
          )}
          <div className="space-y-2">
            {oidcProviders.map((p) => (
              <SnsButton key={p.id} href={`/api/auth/oidc/${p.id}${nextQuery}`} name={p.name} />
            ))}
          </div>
        </>
      )}
      <p className="text-center text-sm text-base-500">
        {t('login.noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-point-500">
          {t('login.signupLink')}
        </Link>
      </p>
    </div>
  )
}
