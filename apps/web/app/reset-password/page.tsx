'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, useTransition } from 'react'

function ResetForm() {
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
          링크를 확인해주세요
        </h1>
        <p className="mt-2 text-sm text-base-500">
          이 링크가 올바른지 확인해주세요. 관리자에게 새 링크를 요청할 수 있어요.
        </p>
      </Card>
    )
  }

  const submit = () => {
    setError(null)
    if (pw.length < 8) {
      setError('비밀번호는 8자 이상이어야 해요')
      return
    }
    if (pw !== pw2) {
      setError('비밀번호가 일치하지 않아요')
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
        setError(data.error ?? '잠시 후 다시 시도해주세요')
        return
      }
      setDone(true)
      setTimeout(() => router.replace('/login'), 1200)
    })
  }

  if (done) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-base-900 dark:text-base-50">완료됐어요</h1>
        <p className="mt-2 text-sm text-base-500">새 비밀번호로 로그인 화면으로 이동할게요.</p>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-lg font-semibold text-base-900 dark:text-base-50">새 비밀번호 설정</h1>
      <p className="mt-1 text-sm text-base-500">새로 사용할 비밀번호를 입력해주세요.</p>
      <div className="mt-4 flex flex-col gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          className="w-full rounded-2xl border border-base-200 bg-base-0 px-3 py-2.5 text-sm outline-none focus:border-point-400 dark:border-base-700 dark:bg-base-900 dark:text-base-50"
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="새 비밀번호 확인"
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
        {pending ? '변경 중…' : '비밀번호 변경'}
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
