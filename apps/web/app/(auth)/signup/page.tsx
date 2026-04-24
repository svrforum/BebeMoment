'use client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'

type Step = 'email' | 'password' | 'name'

const STEPS: Step[] = ['email', 'password', 'name']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function scorePassword(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0
  let score = 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) score++
  if (pw.length >= 12) score = Math.min(3, score + 1) as 0 | 1 | 2 | 3
  return Math.min(3, score) as 0 | 1 | 2 | 3
}

function SignupWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = params.get('invite')
  const prefilledEmail = params.get('email') ?? ''

  const [step, setStep] = useState<Step>('email')
  const [dir, setDir] = useState<1 | -1>(1)
  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const confirmRef = useRef<HTMLInputElement>(null)

  const idx = STEPS.indexOf(step)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset error on step change
  useEffect(() => {
    setError(null)
  }, [step])

  const stepValid = (() => {
    if (step === 'email') return EMAIL_RE.test(email.trim())
    if (step === 'password') return password.length >= 8 && confirm === password
    if (step === 'name') return displayName.trim().length > 0
    return false
  })()

  const goBack = useCallback(() => {
    if (idx === 0) {
      router.push('/login')
      return
    }
    setDir(-1)
    const prev = STEPS[idx - 1]
    if (prev) setStep(prev)
  }, [idx, router])

  const submitSignup = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        const message = data.error ?? '가입에 실패했어요'
        setError(message)
        setSubmitting(false)
        if (message.includes('이메일')) {
          setDir(-1)
          setStep('email')
        }
        return
      }
      if (inviteToken) {
        await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        })
        // Hard navigation so the new session cookie attaches to the next RSC request
        window.location.replace('/')
      } else {
        window.location.replace('/onboarding')
      }
    } catch {
      setError('네트워크 오류가 발생했어요')
      setSubmitting(false)
    }
  }, [email, password, displayName, inviteToken])

  const goNext = useCallback(() => {
    if (!stepValid || submitting) return
    if (step === 'name') {
      submitSignup()
      return
    }
    setDir(1)
    const next = STEPS[idx + 1]
    if (next) setStep(next)
  }, [stepValid, submitting, step, idx, submitSignup])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      goNext()
    }
  }

  const pwScore = scorePassword(password)

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-8 pt-6 md:min-h-0 md:p-0">
      <div className="mb-10 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          aria-label="이전"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-base-700 hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-800"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-1.5" aria-label={`${idx + 1} / ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === idx
                  ? 'w-6 bg-point-500'
                  : i < idx
                    ? 'w-1.5 bg-point-500/60'
                    : 'w-1.5 bg-base-200 dark:bg-base-700',
              )}
            />
          ))}
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1">
        <AnimatePresence initial={false} mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ x: dir === 1 ? 48 : -48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir === 1 ? -48 : 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            {step === 'email' && (
              <>
                {inviteToken && (
                  <p className="mb-4 rounded-2xl bg-point-500/10 px-4 py-3 text-sm text-point-500">
                    초대 링크로 가입하시는군요. 가입이 끝나면 가족에 합류돼요.
                  </p>
                )}
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  이메일을 알려주세요
                </h1>
                <p className="mt-3 text-base text-base-500">앞으로 로그인에 사용할 이메일이에요.</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="name@example.com"
                  inputMode="email"
                  autoComplete="email"
                  className="mt-8 h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                />
              </>
            )}

            {step === 'password' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  비밀번호를 만들어주세요
                </h1>
                <p className="mt-3 text-base text-base-500">
                  8자 이상, 다른 곳에서 쓰지 않은 값으로.
                </p>
                <div className="relative mt-8">
                  <input
                    // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                    autoFocus
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        confirmRef.current?.focus()
                      }
                    }}
                    placeholder="비밀번호"
                    autoComplete="new-password"
                    className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 pr-12 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? '비밀번호 가리기' : '비밀번호 보기'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-base-500 transition hover:bg-base-200/60 hover:text-base-900 dark:hover:bg-base-700 dark:hover:text-base-100"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <PasswordStrengthBar score={pwScore} visible={password.length > 0} />
                <div className="relative mt-6">
                  <input
                    ref={confirmRef}
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="비밀번호 확인"
                    autoComplete="new-password"
                    className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 pr-12 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                  />
                  {confirm.length > 0 && confirm === password && (
                    <Check
                      size={20}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-point-500"
                    />
                  )}
                </div>
                {confirm.length > 0 && confirm !== password && (
                  <p className="mt-3 text-sm text-danger">비밀번호가 일치하지 않아요</p>
                )}
              </>
            )}

            {step === 'name' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  어떻게 불러드릴까요?
                </h1>
                <p className="mt-3 text-base text-base-500">가족에게 보여질 이름이에요.</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="예: 김민준"
                  autoComplete="name"
                  maxLength={80}
                  className="mt-8 h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="pt-6">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!stepValid || submitting}
          onClick={goNext}
        >
          {submitting ? '가입하는 중…' : step === 'name' ? '시작하기' : '다음'}
        </Button>
        {step === 'email' && (
          <p className="pt-4 text-center text-sm text-base-500">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-point-500">
              로그인
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}

function PasswordStrengthBar({
  score,
  visible,
}: {
  score: 0 | 1 | 2 | 3
  visible: boolean
}) {
  if (!visible) return <div className="mt-6 h-6" />
  const label =
    score === 0 ? '너무 짧아요' : score === 1 ? '약해요' : score === 2 ? '보통' : '강해요'
  return (
    <div className="mt-6">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= score
                ? score === 1
                  ? 'bg-danger/70'
                  : score === 2
                    ? 'bg-warning/70'
                    : 'bg-point-500'
                : 'bg-base-200 dark:bg-base-700',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-base-500">{label}</p>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupWizard />
    </Suspense>
  )
}
