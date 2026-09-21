import { describe, expect, it } from 'vitest'
import { occurrenceDatesInRange, reminderWallClock, wallClockToInstant } from './reminder-time'

describe('occurrenceDatesInRange', () => {
  const once = { onDate: '2026-09-24', repeatYearly: false, repeatUntil: null }

  it('반복이 없으면 구간에 들 때만 그 날짜 하나', () => {
    expect(occurrenceDatesInRange(once, '2026-09-01', '2026-09-30')).toEqual(['2026-09-24'])
    expect(occurrenceDatesInRange(once, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('매년 반복은 구간에 드는 해의 같은 월일을 낸다', () => {
    const yearly = { onDate: '2024-03-05', repeatYearly: true, repeatUntil: null }
    expect(occurrenceDatesInRange(yearly, '2026-01-01', '2026-12-31')).toEqual(['2026-03-05'])
    expect(occurrenceDatesInRange(yearly, '2026-03-01', '2027-03-31')).toEqual([
      '2026-03-05',
      '2027-03-05',
    ])
  })

  it('시작 연도 이전에는 회차가 없다', () => {
    const yearly = { onDate: '2026-03-05', repeatYearly: true, repeatUntil: null }
    expect(occurrenceDatesInRange(yearly, '2020-01-01', '2020-12-31')).toEqual([])
  })

  it('종료일 이후에는 회차가 없다', () => {
    const yearly = { onDate: '2020-03-05', repeatYearly: true, repeatUntil: '2026-12-31' }
    expect(occurrenceDatesInRange(yearly, '2027-01-01', '2027-12-31')).toEqual([])
  })

  it('2월 29일 반복은 평년에는 2월 28일로 맞춘다', () => {
    const leap = { onDate: '2024-02-29', repeatYearly: true, repeatUntil: null }
    expect(occurrenceDatesInRange(leap, '2026-01-01', '2026-12-31')).toEqual(['2026-02-28'])
    expect(occurrenceDatesInRange(leap, '2028-01-01', '2028-12-31')).toEqual(['2028-02-29'])
  })
})

describe('reminderWallClock', () => {
  it('시각 일정은 시작에서 선행 분을 뺀다', () => {
    expect(reminderWallClock('2026-09-24', 600, { kind: 'lead', leadMinutes: 30 })).toEqual({
      year: 2026,
      month: 9,
      day: 24,
      minute: 570,
    })
  })

  it('선행 분이 자정을 넘으면 전날로 넘어간다', () => {
    expect(reminderWallClock('2026-09-24', 30, { kind: 'lead', leadMinutes: 60 })).toEqual({
      year: 2026,
      month: 9,
      day: 23,
      minute: 1410,
    })
  })

  it('하루 전 알림은 날짜를 빼고 지정한 시각에 둔다', () => {
    expect(
      reminderWallClock('2026-09-24', null, { kind: 'dayBefore', daysBefore: 1, atMinute: 540 }),
    ).toEqual({ year: 2026, month: 9, day: 23, minute: 540 })
  })

  it('당일 알림은 그날 지정한 시각이다', () => {
    expect(
      reminderWallClock('2026-03-01', null, { kind: 'dayBefore', daysBefore: 0, atMinute: 480 }),
    ).toEqual({ year: 2026, month: 3, day: 1, minute: 480 })
  })

  it('달 경계를 넘어 뺀다', () => {
    expect(
      reminderWallClock('2026-03-01', null, { kind: 'dayBefore', daysBefore: 7, atMinute: 540 }),
    ).toEqual({ year: 2026, month: 2, day: 22, minute: 540 })
  })

  it('종일 일정에 lead 알림이 오면 자정 기준으로 계산한다', () => {
    expect(reminderWallClock('2026-09-24', null, { kind: 'lead', leadMinutes: 60 })).toEqual({
      year: 2026,
      month: 9,
      day: 23,
      minute: 1380,
    })
  })
})

describe('wallClockToInstant', () => {
  it('벽시계 부품을 인스턴스 로컬 시각으로 해석한다', () => {
    const at = wallClockToInstant({ year: 2026, month: 9, day: 24, minute: 570 })
    expect(at.getFullYear()).toBe(2026)
    expect(at.getMonth()).toBe(8)
    expect(at.getDate()).toBe(24)
    expect(at.getHours()).toBe(9)
    expect(at.getMinutes()).toBe(30)
  })

  it('자정은 그날 0시 0분 0초다', () => {
    const at = wallClockToInstant({ year: 2026, month: 1, day: 1, minute: 0 })
    expect(at.getHours()).toBe(0)
    expect(at.getMinutes()).toBe(0)
    expect(at.getSeconds()).toBe(0)
    expect(at.getMilliseconds()).toBe(0)
  })
})
