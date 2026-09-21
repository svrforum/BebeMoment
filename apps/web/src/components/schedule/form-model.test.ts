import { describe, expect, it } from 'vitest'
import {
  ALL_DAY_PRESET_DAYS,
  MORNING_MINUTE,
  TIMED_PRESET_LEADS,
  appendChecklistItem,
  convertReminders,
  leadParts,
  reminderKey,
} from './form-model'

describe('appendChecklistItem', () => {
  it('다듬은 라벨을 끝에 붙인다', () => {
    const items = [{ key: 'a', id: null, label: '기저귀' }]
    expect(appendChecklistItem(items, '  물티슈 ', 'b')).toEqual([
      { key: 'a', id: null, label: '기저귀' },
      { key: 'b', id: null, label: '물티슈' },
    ])
  })

  it('빈 입력이면 같은 배열을 그대로 돌려준다 — 엔터를 눌러도 아무 일이 없어야 한다', () => {
    const items = [{ key: 'a', id: null, label: '기저귀' }]
    expect(appendChecklistItem(items, '   ', 'b')).toBe(items)
    expect(appendChecklistItem(items, '', 'b')).toBe(items)
  })
})

describe('leadParts', () => {
  it('가장 큰 단위로 끊는다', () => {
    expect(leadParts(0)).toEqual({ unit: 'minute', n: 0 })
    expect(leadParts(45)).toEqual({ unit: 'minute', n: 45 })
    expect(leadParts(90)).toEqual({ unit: 'minute', n: 90 })
    expect(leadParts(60)).toEqual({ unit: 'hour', n: 1 })
    expect(leadParts(180)).toEqual({ unit: 'hour', n: 3 })
    expect(leadParts(1440)).toEqual({ unit: 'day', n: 1 })
    expect(leadParts(10080)).toEqual({ unit: 'day', n: 7 })
  })
})

describe('reminderKey', () => {
  it('같은 뜻의 알림은 같은 키다', () => {
    expect(reminderKey({ kind: 'lead', leadMinutes: 30 })).toBe(
      reminderKey({ kind: 'lead', leadMinutes: 30 }),
    )
    expect(reminderKey({ kind: 'dayBefore', daysBefore: 1, atMinute: 540 })).not.toBe(
      reminderKey({ kind: 'dayBefore', daysBefore: 1, atMinute: 600 }),
    )
  })
})

describe('convertReminders', () => {
  it('프리셋은 시각↔종일을 오가도 같은 뜻으로 남는다', () => {
    const timed = TIMED_PRESET_LEADS.filter((m) => m >= 1440).map((leadMinutes) => ({
      kind: 'lead' as const,
      leadMinutes,
    }))
    const out = convertReminders(timed, 'allDay', {
      startMinute: MORNING_MINUTE,
      atMinute: MORNING_MINUTE,
    })
    expect(out.dropped).toBe(0)
    expect(out.specs).toEqual(
      ALL_DAY_PRESET_DAYS.filter((d) => d > 0).map((daysBefore) => ({
        kind: 'dayBefore',
        daysBefore,
        atMinute: MORNING_MINUTE,
      })),
    )
  })

  it('하루 안쪽 알림들은 종일로 바뀌며 당일 아침 하나로 합쳐지고, 줄어든 만큼 알린다', () => {
    const out = convertReminders(
      [
        { kind: 'lead', leadMinutes: 15 },
        { kind: 'lead', leadMinutes: 30 },
      ],
      'allDay',
      { startMinute: MORNING_MINUTE, atMinute: MORNING_MINUTE },
    )
    expect(out.specs).toEqual([{ kind: 'dayBefore', daysBefore: 0, atMinute: MORNING_MINUTE }])
    expect(out.dropped).toBe(1)
  })

  it('종일→시각은 시작 시각을 기준으로 앞선 만큼을 계산한다', () => {
    const out = convertReminders([{ kind: 'dayBefore', daysBefore: 1, atMinute: 540 }], 'timed', {
      startMinute: 600,
      atMinute: 540,
    })
    expect(out).toEqual({ specs: [{ kind: 'lead', leadMinutes: 1500 }], dropped: 0 })
  })

  it('시작 시각보다 늦게 울릴 알림은 옮길 수 없으니 지우고 알린다', () => {
    const out = convertReminders([{ kind: 'dayBefore', daysBefore: 0, atMinute: 1080 }], 'timed', {
      startMinute: 540,
      atMinute: 540,
    })
    expect(out).toEqual({ specs: [], dropped: 1 })
  })

  it('30일을 넘어가는 알림은 저장할 수 없으니 지운다', () => {
    const out = convertReminders([{ kind: 'dayBefore', daysBefore: 30, atMinute: 0 }], 'timed', {
      startMinute: 1439,
      atMinute: 540,
    })
    expect(out).toEqual({ specs: [], dropped: 1 })
  })

  it('이미 그 모양인 알림은 건드리지 않는다', () => {
    const specs = [{ kind: 'lead' as const, leadMinutes: 60 }]
    expect(convertReminders(specs, 'timed', { startMinute: 540, atMinute: 540 })).toEqual({
      specs,
      dropped: 0,
    })
  })
})
