'use client'
import { cn } from '@/lib/cn'
import { currentPushEnabled, isNativeApp, pushSupported } from '@/lib/push-client'
import type { ReminderSpec } from '@/server/schedule/reminder-time'
import { BellOff, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ALL_DAY_PRESET_DAYS,
  MAX_DAYS_BEFORE,
  MAX_LEAD_MINUTES,
  MORNING_MINUTE,
  type ReminderMode,
  TIMED_PRESET_LEADS,
  reminderKey,
} from './form-model'
import { useReminderLabel } from './reminder-label'

type Props = {
  mode: ReminderMode
  specs: ReminderSpec[]
  onChange: (specs: ReminderSpec[]) => void
  /** 인스턴스 관리자 마스터 스위치(`push.enabled`). 꺼져 있으면 아무에게도 안 간다. */
  pushEnabled: boolean
}

const UNITS = [
  { key: 'minute', minutes: 1 },
  { key: 'hour', minutes: 60 },
  { key: 'day', minutes: 1440 },
] as const

type UnitKey = (typeof UNITS)[number]['key']

function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function minutesFromTimeValue(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const minute = Number(m[1]) * 60 + Number(m[2])
  return minute >= 0 && minute <= 1439 ? minute : null
}

export function ReminderPicker({ mode, specs, onChange, pushEnabled }: Props) {
  const t = useTranslations('schedule')
  const describe = useReminderLabel()
  const [customOpen, setCustomOpen] = useState(false)
  const [amount, setAmount] = useState('10')
  const [unit, setUnit] = useState<UnitKey>('minute')
  const [days, setDays] = useState('1')
  const [at, setAt] = useState(timeValue(MORNING_MINUTE))
  const [deviceReady, setDeviceReady] = useState<boolean | null>(null)

  // 이 기기가 알림을 받도록 등록돼 있는지. 앱은 자체 경로로 등록하므로 여기서 따지지 않는다.
  useEffect(() => {
    if (isNativeApp()) {
      setDeviceReady(true)
      return
    }
    if (!pushSupported()) {
      setDeviceReady(false)
      return
    }
    currentPushEnabled().then(setDeviceReady, () => setDeviceReady(false))
  }, [])

  const chosen = useMemo(() => new Set(specs.map(reminderKey)), [specs])

  const presets: ReminderSpec[] =
    mode === 'timed'
      ? TIMED_PRESET_LEADS.map((leadMinutes) => ({ kind: 'lead', leadMinutes }))
      : ALL_DAY_PRESET_DAYS.map((daysBefore) => ({
          kind: 'dayBefore',
          daysBefore,
          atMinute: MORNING_MINUTE,
        }))

  const toggle = (spec: ReminderSpec) => {
    const key = reminderKey(spec)
    onChange(chosen.has(key) ? specs.filter((s) => reminderKey(s) !== key) : [...specs, spec])
  }

  const extras = specs.filter((spec) => !presets.some((p) => reminderKey(p) === reminderKey(spec)))

  const addCustom = () => {
    const spec = buildCustom()
    if (!spec) return
    if (chosen.has(reminderKey(spec))) return
    onChange([...specs, spec])
  }

  function buildCustom(): ReminderSpec | null {
    if (mode === 'timed') {
      const n = Number(amount)
      const per = UNITS.find((u) => u.key === unit)?.minutes ?? 1
      if (!Number.isInteger(n) || n < 0) return null
      const leadMinutes = n * per
      return leadMinutes <= MAX_LEAD_MINUTES ? { kind: 'lead', leadMinutes } : null
    }
    const d = Number(days)
    const atMinute = minutesFromTimeValue(at)
    if (!Number.isInteger(d) || d < 0 || d > MAX_DAYS_BEFORE || atMinute === null) return null
    return { kind: 'dayBefore', daysBefore: d, atMinute }
  }

  const pushMissing = specs.length > 0 && (!pushEnabled || deviceReady === false)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((spec) => {
          const key = reminderKey(spec)
          const active = chosen.has(key)
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(spec)}
              className={cn(
                'focus-ring rounded-full px-3 py-1.5 text-[13px] font-medium transition active:scale-95',
                active
                  ? 'bg-point-500 text-white'
                  : 'bg-base-100 text-base-600 dark:bg-base-800 dark:text-base-300',
              )}
            >
              {describe(spec)}
            </button>
          )
        })}
      </div>

      {extras.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {extras.map((spec) => (
            <li key={reminderKey(spec)}>
              <span className="flex items-center gap-1 rounded-full bg-point-500/12 py-1.5 pl-3 pr-1.5 text-[13px] font-medium text-point-600 dark:text-point-300">
                {describe(spec)}
                <button
                  type="button"
                  aria-label={t('reminder.remove')}
                  onClick={() => toggle(spec)}
                  className="focus-ring flex h-5 w-5 items-center justify-center rounded-full transition active:scale-90"
                >
                  <X size={13} strokeWidth={2.6} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {customOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'timed' ? (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={t('reminder.customAmount')}
                className="h-10 w-20 rounded-xl bg-base-100 px-3 text-[14px] tabular-nums text-base-900 dark:bg-base-800 dark:text-base-100"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitKey)}
                aria-label={t('reminder.customUnit')}
                className="h-10 rounded-xl bg-base-100 px-3 text-[14px] text-base-900 dark:bg-base-800 dark:text-base-100"
              >
                {UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {t(`reminder.unit.${u.key}`)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DAYS_BEFORE}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-label={t('reminder.customDays')}
                className="h-10 w-20 rounded-xl bg-base-100 px-3 text-[14px] tabular-nums text-base-900 dark:bg-base-800 dark:text-base-100"
              />
              <input
                type="time"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                aria-label={t('reminder.customAt')}
                className="h-10 rounded-xl bg-base-100 px-3 text-[14px] tabular-nums text-base-900 dark:bg-base-800 dark:text-base-100"
              />
            </>
          )}
          <button
            type="button"
            onClick={addCustom}
            className="focus-ring flex h-10 items-center gap-1 rounded-xl bg-base-900 px-3 text-[13px] font-semibold text-white transition active:scale-95 dark:bg-base-100 dark:text-base-900"
          >
            <Plus size={15} strokeWidth={2.6} />
            {t('reminder.customAdd')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="focus-ring text-[13px] font-medium text-point-600 underline-offset-4 transition active:opacity-70 dark:text-point-300"
        >
          {t('reminder.custom')}
        </button>
      )}

      {pushMissing && (
        <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-base-700 dark:text-base-200">
          <BellOff size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-warning" />
          <span>
            {pushEnabled ? t('reminder.pushDevice') : t('reminder.pushOff')}{' '}
            <Link
              href="/settings/notifications"
              prefetch={false}
              className="font-semibold text-point-600 underline dark:text-point-300"
            >
              {t('reminder.pushSettings')}
            </Link>
          </span>
        </div>
      )}
    </div>
  )
}
