import type { ScheduleEntryView } from '@/server/schedule/list'
import { describe, expect, it } from 'vitest'
import { upcomingSchedule } from './schedule-upcoming'

function entry(partial: Partial<ScheduleEntryView> & { id: string }): ScheduleEntryView {
  return {
    title: partial.id,
    onDate: null,
    startMinute: null,
    doneAt: null,
    checklistTotal: 0,
    checklistDone: 0,
    reminderCount: 0,
    ...partial,
  }
}

const TODAY = '2026-09-22'

describe('upcomingSchedule', () => {
  it('오늘 것이 맨 앞, 그 다음 가까운 순서로 준다', () => {
    const result = upcomingSchedule(
      [
        entry({ id: 'next-week', onDate: '2026-09-29', startMinute: 600 }),
        entry({ id: 'today-timed', onDate: TODAY, startMinute: 840 }),
        entry({ id: 'yesterday', onDate: '2026-09-21' }),
        entry({ id: 'today-allday', onDate: TODAY }),
        entry({ id: 'tomorrow', onDate: '2026-09-23', startMinute: 60 }),
      ],
      TODAY,
      5,
    )
    expect(result.kind).toBe('upcoming')
    expect(result.entries.map((e) => e.id)).toEqual([
      'today-allday',
      'today-timed',
      'tomorrow',
      'next-week',
    ])
  })

  it('limit 을 넘으면 가까운 것만 남긴다', () => {
    const result = upcomingSchedule(
      [
        entry({ id: 'a', onDate: TODAY }),
        entry({ id: 'b', onDate: '2026-09-23' }),
        entry({ id: 'c', onDate: '2026-09-24' }),
      ],
      TODAY,
      2,
    )
    expect(result.entries.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('지난 달을 보고 있으면 그 달의 마지막 일정들을 시간순으로 준다', () => {
    const result = upcomingSchedule(
      [
        entry({ id: 'first', onDate: '2026-08-02' }),
        entry({ id: 'mid', onDate: '2026-08-10' }),
        entry({ id: 'last', onDate: '2026-08-30' }),
      ],
      TODAY,
      2,
    )
    expect(result.kind).toBe('past')
    expect(result.entries.map((e) => e.id)).toEqual(['mid', 'last'])
  })

  it('날짜 없는 할 일은 달력 목록에 넣지 않는다', () => {
    const result = upcomingSchedule(
      [entry({ id: 'undated' }), entry({ id: 'dated', onDate: TODAY })],
      TODAY,
      5,
    )
    expect(result.entries.map((e) => e.id)).toEqual(['dated'])
  })

  it('일정이 하나도 없으면 지난 것이 아니라 빈 예정 목록이다', () => {
    expect(upcomingSchedule([], TODAY, 5)).toEqual({ kind: 'upcoming', entries: [] })
  })

  it('입력 배열을 건드리지 않는다', () => {
    const input = [entry({ id: 'b', onDate: '2026-09-23' }), entry({ id: 'a', onDate: TODAY })]
    upcomingSchedule(input, TODAY, 5)
    expect(input.map((e) => e.id)).toEqual(['b', 'a'])
  })
})
