'use client'
import { clockParts } from '@/lib/clock'
import type { ReminderSpec } from '@/server/schedule/reminder-time'
import { useTranslations } from 'next-intl'
import { leadParts } from './form-model'

/**
 * 분(0-1439)을 화면에 쓸 시각 문자열로. 오전/오후 낱말은 카탈로그가 붙인다 — Intl 에 맡기면
 * ICU 판에 따라 한국어가 AM/PM 으로 나오는 환경이 있어 SSR 과 브라우저가 어긋난다(`clockParts`).
 */
export function useMinuteOfDay(): (minute: number) => string {
  const t = useTranslations('schedule')
  return (minute) => {
    const { period, hour12, minute2 } = clockParts(minute)
    return t(period === 'am' ? 'time.am' : 'time.pm', { time: `${hour12}:${minute2}` })
  }
}

/** 프리셋 밖의 값도 화면에 제 이름으로 나와야 한다 — 직접 넣은 알림이 이름 없는 칩이 되면 지울 수도 없다. */
export function useReminderLabel(): (spec: ReminderSpec) => string {
  const t = useTranslations('schedule')
  const minuteOfDay = useMinuteOfDay()
  return (spec) => {
    if (spec.kind === 'lead') {
      const { unit, n } = leadParts(spec.leadMinutes)
      if (n === 0) return t('reminder.atTime')
      if (unit === 'hour') return t('reminder.hoursBefore', { n })
      if (unit === 'day') return t('reminder.daysBefore', { n })
      return t('reminder.minutesBefore', { n })
    }
    const time = minuteOfDay(spec.atMinute)
    if (spec.daysBefore === 0) return t('reminder.morningOf', { time })
    return t('reminder.daysBeforeAt', { n: spec.daysBefore, time })
  }
}
