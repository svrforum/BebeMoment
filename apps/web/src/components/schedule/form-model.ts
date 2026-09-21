import type { ReminderSpec } from '@/server/schedule/reminder-time'

export type ChecklistDraftItem = { key: string; id: string | null; label: string }

export type ReminderMode = 'timed' | 'allDay'

/** 종일 일정 알림의 기본 시각(오전 9시). 없으면 생일 알림이 자정에 울린다. */
export const MORNING_MINUTE = 540

export const MAX_LEAD_MINUTES = 43200
export const MAX_DAYS_BEFORE = 30

export const TIMED_PRESET_LEADS = [0, 15, 30, 60, 180, 1440, 4320, 10080] as const
export const ALL_DAY_PRESET_DAYS = [0, 1, 3, 7] as const

/**
 * 빈 입력이면 **같은 배열을 그대로** 돌려준다. 호출부가 참조 비교로 "아무 일도 없었다" 를
 * 알아 입력을 비우거나 포커스를 건드리지 않는다 — 엔터로 항목을 이어 넣는 동안 키보드가
 * 닫히면 12개짜리 준비물 목록이 고역이 된다.
 */
export function appendChecklistItem(
  items: ChecklistDraftItem[],
  label: string,
  key: string,
): ChecklistDraftItem[] {
  const trimmed = label.trim()
  if (trimmed === '') return items
  return [...items, { key, id: null, label: trimmed }]
}

export function leadParts(leadMinutes: number): {
  unit: 'minute' | 'hour' | 'day'
  n: number
} {
  if (leadMinutes >= 1440 && leadMinutes % 1440 === 0) return { unit: 'day', n: leadMinutes / 1440 }
  if (leadMinutes >= 60 && leadMinutes % 60 === 0) return { unit: 'hour', n: leadMinutes / 60 }
  return { unit: 'minute', n: leadMinutes }
}

/** 저장된 유니크 인덱스와 같은 정체 — 같은 키면 같은 알림이다. */
export function reminderKey(spec: ReminderSpec): string {
  return spec.kind === 'lead'
    ? `lead:${spec.leadMinutes}`
    : `day:${spec.daysBefore}:${spec.atMinute}`
}

function dedupe(specs: ReminderSpec[]): ReminderSpec[] {
  const seen = new Set<string>()
  return specs.filter((spec) => {
    const key = reminderKey(spec)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toAllDay(spec: ReminderSpec, atMinute: number): ReminderSpec | null {
  if (spec.kind === 'dayBefore') return spec
  const days = Math.round(spec.leadMinutes / 1440)
  if (days > MAX_DAYS_BEFORE) return null
  return { kind: 'dayBefore', daysBefore: days, atMinute }
}

function toTimed(spec: ReminderSpec, startMinute: number): ReminderSpec | null {
  if (spec.kind === 'lead') return spec
  const lead = startMinute - spec.atMinute + spec.daysBefore * 1440
  if (lead < 0 || lead > MAX_LEAD_MINUTES) return null
  return { kind: 'lead', leadMinutes: lead }
}

/**
 * 종일↔시각을 바꿀 때 알림을 같은 뜻의 다른 모양으로 옮긴다. 옮길 수 없거나(시작보다 늦게
 * 울리는 알림) 옮긴 결과가 앞선 알림과 겹치면 사라지므로, 줄어든 개수를 함께 돌려준다 —
 * 조용히 버리면 사용자는 알림을 걸었다고 믿은 채 아무것도 못 받는다.
 */
export function convertReminders(
  specs: ReminderSpec[],
  target: ReminderMode,
  opts: { startMinute: number; atMinute: number },
): { specs: ReminderSpec[]; dropped: number } {
  const moved = specs
    .map((spec) =>
      target === 'allDay' ? toAllDay(spec, opts.atMinute) : toTimed(spec, opts.startMinute),
    )
    .filter((spec): spec is ReminderSpec => spec !== null)
  const kept = dedupe(moved)
  return { specs: kept, dropped: specs.length - kept.length }
}
