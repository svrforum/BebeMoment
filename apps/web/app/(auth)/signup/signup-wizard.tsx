'use client'
import { BrandLockup } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Step = 'username' | 'password' | 'name' | 'email' | 'optional'
const STEPS_OWNER: Step[] = ['username', 'password', 'name', 'email']
const STEPS_INVITED: Step[] = ['name', 'password', 'optional']
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_MAX_RETRIES = 5

function scorePassword(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0
  let score = 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^\w\s]/.test(pw)) score++
  if (pw.length >= 12) score = Math.min(3, score + 1) as 0 | 1 | 2 | 3
  return Math.min(3, score) as 0 | 1 | 2 | 3
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * displayName → username 후보. 허용 문자(`a-z0-9._-`) 외는 `-` 로 치환, 양끝 `-._` 정리,
 * 3~30 길이로 맞춤. 사용 가능한 문자가 없으면 `user` 폴백. 매 호출마다 4-char hex suffix 부착.
 */
function autoUsername(displayName: string): string {
  const suffix = randomHex(2) // 4 hex chars
  const lowered = displayName.trim().toLowerCase()
  const cleaned = lowered.replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '')
  const base = cleaned.length > 0 ? cleaned : 'user'
  // suffix + '-' 자리 확보(5자)
  const maxBase = 30 - suffix.length - 1
  const trimmed = base.slice(0, Math.max(1, maxBase)).replace(/[-._]+$/g, '') || 'user'
  const candidate = `${trimmed}-${suffix}`
  // 최종 3~30, 정규식 통과 보증
  if (USERNAME_RE.test(candidate)) return candidate
  return `user-${randomHex(3)}` // 9자, 항상 통과
}

function SignupWizardInner({
  inviteTokenProp,
  embedded,
}: {
  inviteTokenProp?: string | undefined
  embedded?: boolean | undefined
}) {
  const t = useTranslations('auth')
  const router = useRouter()
  const params = useSearchParams()
  const inviteToken = inviteTokenProp ?? params?.get('invite') ?? null
  const invited = Boolean(inviteToken)

  const steps = useMemo<Step[]>(() => (invited ? STEPS_INVITED : STEPS_OWNER), [invited])

  const [step, setStep] = useState<Step>(() => (invited ? 'name' : 'username'))
  const [dir, setDir] = useState<1 | -1>(1)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const confirmRef = useRef<HTMLInputElement>(null)

  const idx = steps.indexOf(step)
  const isLast = idx === steps.length - 1

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset error on step change
  useEffect(() => {
    setError(null)
  }, [step])

  const stepValid = (() => {
    if (step === 'username') return USERNAME_RE.test(username.trim().toLowerCase())
    if (step === 'password') return password.length >= 8 && confirm === password
    if (step === 'name') return displayName.trim().length > 0
    if (step === 'email') return email.trim() === '' || EMAIL_RE.test(email.trim())
    if (step === 'optional') {
      // 둘 다 비워도 OK (자동 생성). 입력 시에는 형식 검증.
      const u = username.trim().toLowerCase()
      const e = email.trim()
      if (u !== '' && !USERNAME_RE.test(u)) return false
      if (e !== '' && !EMAIL_RE.test(e)) return false
      return true
    }
    return false
  })()

  const goBack = useCallback(() => {
    if (idx <= 0) {
      router.push('/login')
      return
    }
    setDir(-1)
    const prev = steps[idx - 1]
    if (prev) setStep(prev)
  }, [idx, router, steps])

  const submitSignup = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const enteredUsername = username.trim().toLowerCase()
      const enteredEmail = email.trim()
      const trimmedName = displayName.trim()

      // 초대 경로에서 username 미입력이면 자동 생성. 서버가 '이미 사용 중인 아이디예요'
      // 로 거절하면 새 hex suffix 로 재시도. 재시도 한계까지 실패하면 마지막 에러를 보여줌.
      const shouldAutogen = invited && enteredUsername === ''
      let attempt = 0
      let lastError: string | null = null
      while (attempt < (shouldAutogen ? USERNAME_MAX_RETRIES : 1)) {
        const usernameToSend = shouldAutogen ? autoUsername(trimmedName) : enteredUsername
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(usernameToSend ? { username: usernameToSend } : {}),
            password,
            displayName: trimmedName,
            ...(enteredEmail ? { email: enteredEmail } : {}),
            ...(inviteToken ? { inviteToken } : {}),
          }),
        })
        if (res.ok) {
          // 초대 가입은 /api/auth/signup 이 토큰을 소비하고 가족에 합류까지 처리한다
          // (별도 accept 호출 불필요). 초대면 홈으로, 아니면 온보딩으로.
          window.location.replace(inviteToken ? '/' : '/onboarding')
          return
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        const message = data.error ?? t('signup.failed')
        lastError = message
        // 자동 생성 중 username 충돌이면 재시도, 그 외(이메일 충돌·검증 등)는 즉시 중단.
        if (shouldAutogen && message.includes('이미 사용 중인 아이디')) {
          attempt++
          continue
        }
        setError(message)
        setSubmitting(false)
        if (!invited && message.includes('아이디')) {
          setDir(-1)
          setStep('username')
        }
        return
      }
      // 재시도 한계 도달
      setError(lastError ?? t('signup.autoUsernameFailed'))
      setSubmitting(false)
    } catch {
      setError(t('signup.networkError'))
      setSubmitting(false)
    }
  }, [username, password, displayName, email, inviteToken, invited, t])

  const goNext = useCallback(() => {
    if (!stepValid || submitting) return
    if (isLast) {
      submitSignup()
      return
    }
    setDir(1)
    const next = steps[idx + 1]
    if (next) setStep(next)
  }, [stepValid, submitting, isLast, idx, steps, submitSignup])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      goNext()
    }
  }

  const pwScore = scorePassword(password)
  const inputCls =
    'mt-8 h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80'

  const ctaLabel = (() => {
    if (submitting) return t('signup.cta.submitting')
    if (!isLast) return t('signup.cta.next')
    if (step === 'email')
      return email.trim() ? t('signup.cta.submit') : t('signup.cta.skipAndSubmit')
    if (step === 'optional') {
      const u = username.trim()
      const e = email.trim()
      if (u === '' && e === '') return t('signup.cta.autoUsernameSubmit')
      return t('signup.cta.submit')
    }
    return t('signup.cta.submit')
  })()

  return (
    <main
      className={
        embedded
          ? 'flex flex-col pb-4 pt-2 md:p-0'
          : 'flex min-h-[100dvh] flex-col px-6 pb-8 pt-6 md:min-h-0 md:p-0'
      }
    >
      {/* 독립 /signup 모바일 브랜드 배너(데스크탑은 (auth) 히어로). 임베드(초대)는 페이지가 직접 노출. */}
      {!embedded && <BrandLockup className="mb-8 md:hidden" />}
      <div className="mb-10 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          aria-label={t('signup.back')}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-base-700 hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-800"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-1.5" aria-label={`${idx + 1} / ${steps.length}`}>
          {steps.map((s, i) => (
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

      {/* flex-1 제거 — 짧은 스텝(이름 1줄)에서 입력과 '다음' 버튼 사이 공백이 과하게
          벌어지지 않게. 콘텐츠 바로 아래에 버튼이 따라온다(한 화면에 모두 보이게). */}
      <div>
        <AnimatePresence initial={false} mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ x: dir === 1 ? 48 : -48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir === 1 ? -48 : 48, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            {invited && idx === 0 && (
              <p className="mb-4 rounded-2xl bg-point-500/10 px-4 py-3 text-sm text-point-500">
                {t('signup.inviteBanner')}
              </p>
            )}

            {step === 'username' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  {t('signup.username.title')}
                </h1>
                <p className="mt-3 text-base text-base-500">{t('signup.username.body')}</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('signup.username.placeholder')}
                  autoComplete="username"
                  className={inputCls}
                />
              </>
            )}

            {step === 'password' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  {t('signup.password.title')}
                </h1>
                <p className="mt-3 text-base text-base-500">{t('signup.password.body')}</p>
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
                    placeholder={t('signup.password.placeholder')}
                    autoComplete="new-password"
                    className="h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 pr-12 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? t('password.hide') : t('password.show')}
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
                    placeholder={t('signup.password.confirmPlaceholder')}
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
                  <p className="mt-3 text-sm text-danger">{t('signup.password.mismatch')}</p>
                )}
              </>
            )}

            {step === 'name' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  {invited ? t('signup.name.titleInvited') : t('signup.name.title')}
                </h1>
                <p className="mt-3 text-base text-base-500">{t('signup.name.body')}</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('signup.name.placeholder')}
                  autoComplete="name"
                  maxLength={80}
                  className={inputCls}
                />
              </>
            )}

            {step === 'email' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  {t('signup.email.title')}
                </h1>
                <p className="mt-3 text-base text-base-500">{t('signup.email.body')}</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('signup.email.placeholder')}
                  inputMode="email"
                  autoComplete="email"
                  className={inputCls}
                />
              </>
            )}

            {step === 'optional' && (
              <>
                <h1 className="text-[32px] font-bold leading-tight tracking-tight">
                  {t('signup.optional.title')}
                </h1>
                <p className="mt-3 text-base text-base-500">{t('signup.optional.body')}</p>
                <input
                  // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('signup.optional.usernamePlaceholder')}
                  autoComplete="username"
                  className={inputCls}
                />
                {username.trim() !== '' && !USERNAME_RE.test(username.trim().toLowerCase()) && (
                  <p className="mt-2 text-sm text-danger">{t('signup.optional.usernameError')}</p>
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t('signup.optional.emailPlaceholder')}
                  inputMode="email"
                  autoComplete="email"
                  className="mt-4 h-14 w-full rounded-2xl border border-transparent bg-base-100 px-5 text-[17px] text-base-900 transition-all placeholder:text-base-400 hover:bg-base-200/60 focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-50 dark:hover:bg-base-800/80"
                />
                {email.trim() !== '' && !EMAIL_RE.test(email.trim()) && (
                  <p className="mt-2 text-sm text-danger">{t('signup.optional.emailError')}</p>
                )}
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
          {ctaLabel}
        </Button>
        {idx === 0 && (
          <p className="pt-4 text-center text-sm text-base-500">
            {t('signup.haveAccount')}{' '}
            <Link href="/login" className="font-medium text-point-500">
              {t('signup.loginLink')}
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}

function PasswordStrengthBar({ score, visible }: { score: 0 | 1 | 2 | 3; visible: boolean }) {
  const t = useTranslations('auth')
  if (!visible) return <div className="mt-6 h-6" />
  const label =
    score === 0
      ? t('signup.password.strength.tooShort')
      : score === 1
        ? t('signup.password.strength.weak')
        : score === 2
          ? t('signup.password.strength.fair')
          : t('signup.password.strength.strong')
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

export function SignupWizard({
  inviteToken,
  embedded,
}: {
  inviteToken?: string
  embedded?: boolean
}) {
  return (
    <Suspense fallback={null}>
      <SignupWizardInner inviteTokenProp={inviteToken} embedded={embedded} />
    </Suspense>
  )
}
