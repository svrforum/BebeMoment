'use client'
import type { ReminderSpec } from '@/server/schedule/reminder-time'
import { useLocale, useTranslations } from 'next-intl'
import { leadParts } from './form-model'

/** 분(0-1439)을 그 로케일의 시각 문자열로. 날짜는 임의의 고정값이라 UTC 로 읽는다. */
export function formatMinuteOfDay(minute: number, locale: string): string {
  const at = new Date(Date.UTC(2000, 0, 1, Math.floor(minute / 60), minute % 60))
  return at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/** 프리셋 밖의 값도 화면에 제 이름으로 나와야 한다 — 직접 넣은 알림이 이름 없는 칩이 되면 지울 수도 없다. */
export function useReminderLabel(): (spec: ReminderSpec) => string {
  const t = useTranslations('schedule')
  const locale = useLocale()
  return (spec) => {
    if (spec.kind === 'lead') {
      const { unit, n } = leadParts(spec.leadMinutes)
      if (n === 0) return t('reminder.atTime')
      if (unit === 'hour') return t('reminder.hoursBefore', { n })
      if (unit === 'day') return t('reminder.daysBefore', { n })
      return t('reminder.minutesBefore', { n })
    }
    const time = formatMinuteOfDay(spec.atMinute, locale)
    if (spec.daysBefore === 0) return t('reminder.morningOf', { time })
    return t('reminder.daysBeforeAt', { n: spec.daysBefore, time })
  }
}
