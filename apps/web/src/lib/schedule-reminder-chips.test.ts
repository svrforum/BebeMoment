import type { ReminderSpec } from '@/server/schedule/reminder-time'
import { describe, expect, it } from 'vitest'
import { reminderChips } from './schedule-reminder-chips'

const day = (daysBefore: number, atMinute = 540): ReminderSpec => ({
  kind: 'dayBefore',
  daysBefore,
  atMinute,
})
const lead = (leadMinutes: number): ReminderSpec => ({ kind: 'lead', leadMinutes })

const PRESETS = [day(0), day(1), day(3), day(7)]

describe('reminderChips', () => {
  it('걸어 둔 알림이 없으면 프리셋이 전부 꺼진 칩이다', () => {
    expect(reminderChips(PRESETS, [])).toEqual([
      { key: 'day:0:540', spec: day(0), selected: false },
      { key: 'day:1:540', spec: day(1), selected: false },
      { key: 'day:3:540', spec: day(3), selected: false },
      { key: 'day:7:540', spec: day(7), selected: false },
    ])
  })

  it('걸어 둔 프리셋만 켜진다', () => {
    const chips = reminderChips(PRESETS, [day(1)])
    expect(chips.filter((c) => c.selected).map((c) => c.key)).toEqual(['day:1:540'])
  })

  it('직접 넣은 값은 켜진 칩으로 뒤에 붙는다', () => {
    const chips = reminderChips(PRESETS, [day(2, 1200)])
    expect(chips).toHaveLength(5)
    expect(chips[4]).toEqual({ key: 'day:2:1200', spec: day(2, 1200), selected: true })
  })

  it('프리셋이 모양을 바꿔도(시각 일정) 같은 규칙이다', () => {
    const chips = reminderChips([lead(0), lead(15)], [lead(15), lead(90)])
    expect(chips.map((c) => [c.key, c.selected])).toEqual([
      ['lead:0', false],
      ['lead:15', true],
      ['lead:90', true],
    ])
  })

  it('같은 알림이 두 번 들어와도 칩은 하나다 — 칩 key 가 겹치면 목록이 깨진다', () => {
    const chips = reminderChips(PRESETS, [day(2), day(2)])
    expect(chips.map((c) => c.key)).toEqual([
      'day:0:540',
      'day:1:540',
      'day:3:540',
      'day:7:540',
      'day:2:540',
    ])
  })
})
