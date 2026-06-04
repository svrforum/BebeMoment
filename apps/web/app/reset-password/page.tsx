'use client'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, useTransition } from 'react'

function ResetForm() {
  const t = useTranslations('auth.reset')
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!token) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-base-900 dark:text-base-50">
          {t('checkLinkTitle')}
        </h1>
        <p className="mt-2 text-sm text-base-500">{t('checkLinkBody')}</p>
      </Card>
    )
  }

  const submit = () => {
    setError(null)
    if (pw.length < 8) {
      setError(t('tooShort'))
      return
    }
    if (pw !== pw2) {
      setError(t('mismatch'))
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/auth/password-reset/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: pw }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('retry'))
        return
      }
      setDone(true)
      setTimeout(() => router.replace('/login'), 1200)
    })
  }

  if (done) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-base-900 dark:text-base-50">{t('doneTitle')}</h1>
        <p className="mt-2 text-sm text-base-500">{t('doneBody')}</p>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-base-900 dark:text-base-50">{t('title')}</h1>
      <p className="mt-1 text-sm text-base-500">{t('subtitle')}</p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t('newPasswordPlaceholder')}
          className="w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2.5 text-sm outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder={t('confirmPlaceholder')}
          className="w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2.5 text-sm outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-point-500 text-base font-semibold text-white transition-transform ease-ios active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? t('changing') : t('submit')}
      </button>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-5">
      <div className="w-full rounded-3xl border border-base-200/70 bg-base-0 p-6 shadow-card dark:border-base-800/70 dark:bg-base-900">
        {children}
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
