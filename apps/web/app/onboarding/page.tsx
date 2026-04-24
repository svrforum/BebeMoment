'use client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Calendar } from 'lucide-react'
import { useActionState, useCallback, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { completeOnboarding } from './actions'

type Step = 'family' | 'baby' | 'date'

const STEPS: Step[] = ['family', 'baby', 'date']

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? '만드는 중…' : '시작하기'}
    </Button>
  )
}

function yearsAgoISO(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function daysFromNowISO(days: number): string {
  const d = new Date(Date.now() + days * 86400_000)
  return d.toISOString().slice(0, 10)
}

export default function OnboardingPage() {
  const [state, formAction] = useActionState(completeOnboarding, null)

  const [step, setStep] = useState<Step>('family')
  const [dir, setDir] = useState<1 | -1>(1)
  const [familyName, setFamilyName] = useState('')
  const [babyName, setBabyName] = useState('')
  const [birthDate, setBirthDate] = useState('')

  const dateInputRef = useRef<HTMLInputElement>(null)

  const idx = STEPS.indexOf(step)

  const stepValid = (() => {
    if (step === 'family') return familyName.trim().length > 0
    if (step === 'baby') return babyName.trim().length > 0
    if (step === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    return false
  })()

  const goBack = useCallback(() => {
    if (idx === 0) return
    setDir(-1)
    const prev = STEPS[idx - 1]
    if (prev) setStep(prev)
  }, [idx])

  const goNext = useCallback(() => {
    if (!stepValid) return
    if (step === 'date') return // submit handled by form
    setDir(1)
    const next = STEPS[idx + 1]
    if (next) setStep(next)
  }, [stepValid, step, idx])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      goNext()
    }
  }

  const openDatePicker = () => {
    const el = dateInputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
      } catch {
        el.focus()
      }
    } else {
      el.focus()
    }
  }

  const minDate = yearsAgoISO(20)
  const maxDate = daysFromNowISO(400)

  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-8 pt-6 md:min-h-[100dvh] md:max-w-[480px] md:justify-center md:py-16">
      <div className="absolute inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.18_245/.15),transparent_60%)] md:block" />
      <div className="mb-10 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          aria-label="이전"
          disabled={idx === 0}
          className={cn(
            '-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-base-700 transition hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-800',
            idx === 0 && 'pointer-events-none opacity-30',
          )}
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

      <form action={formAction} className="flex flex-1 flex-col">
        {/* hidden fields so all 3 values submit when the form action fires */}
        <input type="hidden" name="familyName" value={familyName} />
        <input type="hidden" name="babyName" value={babyName} />
        <input type="hidden" name="birthDate" value={birthDate} />

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
              {step === 'family' && (
                <>
                  <h1 className="text-3xl font-bold tracking-tight">가족 이름을 지어주세요</h1>
                  <p className="mt-2 text-sm text-base-500">
                    가족 구성원들이 함께 볼 공간의 이름이에요.
                  </p>
                  <input
                    // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                    autoFocus
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="예: 김씨네 가족"
                    maxLength={80}
                    className="mt-8 w-full border-0 border-b border-base-200 bg-transparent pb-2 text-xl outline-none transition focus:border-point-500 dark:border-base-800"
                  />
                </>
              )}

              {step === 'baby' && (
                <>
                  <h1 className="text-3xl font-bold tracking-tight">아기 이름을 알려주세요</h1>
                  <p className="mt-2 text-sm text-base-500">
                    태명도 괜찮아요. 나중에 바꿀 수 있어요.
                  </p>
                  <input
                    // biome-ignore lint/a11y/noAutofocus: wizard step entry needs keyboard focus
                    autoFocus
                    value={babyName}
                    onChange={(e) => setBabyName(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="예: 예준, 콩콩이"
                    maxLength={40}
                    className="mt-8 w-full border-0 border-b border-base-200 bg-transparent pb-2 text-xl outline-none transition focus:border-point-500 dark:border-base-800"
                  />
                </>
              )}

              {step === 'date' && (
                <>
                  <h1 className="text-3xl font-bold tracking-tight">생년월일을 알려주세요</h1>
                  <p className="mt-2 text-sm text-base-500">
                    아직 태어나지 않았다면 예정일을 선택해주세요.
                  </p>
                  <button
                    type="button"
                    onClick={openDatePicker}
                    className="mt-8 flex w-full items-center justify-between border-0 border-b border-base-200 bg-transparent pb-2 text-left outline-none transition focus:border-point-500 dark:border-base-800"
                  >
                    <span
                      className={cn(
                        'text-xl',
                        birthDate ? 'text-base-900 dark:text-base-100' : 'text-base-400',
                      )}
                    >
                      {birthDate
                        ? new Date(`${birthDate}T00:00:00`).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short',
                          })
                        : '날짜 선택'}
                    </span>
                    <Calendar size={20} className="text-base-500" />
                  </button>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    min={minDate}
                    max={maxDate}
                    required
                    aria-label="생년월일"
                    className="sr-only"
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {state?.error && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {state.error}
            </p>
          )}
        </div>

        <div className="pt-6">
          {step === 'date' ? (
            <SubmitButton disabled={!stepValid} />
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!stepValid}
              onClick={goNext}
            >
              다음
            </Button>
          )}
        </div>
      </form>
    </main>
  )
}
