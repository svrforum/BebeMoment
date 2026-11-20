import { describe, expect, it } from 'vitest'
import { dayIndexAt, fractionOfDay, monthTicks } from './scrubber-math'

const day = (key: string) => ({ key, count: 1 })

describe('dayIndexAt / fractionOfDay', () => {
  it('트랙을 날 수로 고르게 나눠 위(0)가 최신 날이다', () => {
    expect(dayIndexAt(0, 4)).toBe(0)
    expect(dayIndexAt(0.24, 4)).toBe(0)
    expect(dayIndexAt(0.25, 4)).toBe(1)
    expect(dayIndexAt(0.99, 4)).toBe(3)
  })

  it('트랙 밖으로 끌어도 처음·끝 날에 붙는다', () => {
    expect(dayIndexAt(-0.3, 4)).toBe(0)
    expect(dayIndexAt(1, 4)).toBe(3)
    expect(dayIndexAt(1.7, 4)).toBe(3)
  })

  it('손잡이는 그 날 칸의 가운데에 선다', () => {
    expect(fractionOfDay(0, 4)).toBe(0.125)
    expect(fractionOfDay(3, 4)).toBe(0.875)
    expect(dayIndexAt(fractionOfDay(2, 7), 7)).toBe(2)
  })

  it('날이 하나뿐이면 가운데', () => {
    expect(fractionOfDay(0, 1)).toBe(0.5)
    expect(dayIndexAt(0.9, 1)).toBe(0)
  })
})

describe('monthTicks', () => {
  it('달이 바뀌는 첫 날마다 눈금, 첫 눈금과 해가 바뀌는 눈금엔 년도를 단다', () => {
    const days = [
      '2027-01-03',
      '2026-12-30',
      '2026-12-02',
      '2026-11-20',
      '2026-11-01',
      '2026-10-31',
      '2026-10-01',
      '2026-09-13',
    ].map(day)
    expect(monthTicks(days, 0)).toEqual([
      { month: '2027-01', fraction: 0, showYear: true },
      { month: '2026-12', fraction: 1 / 8, showYear: true },
      { month: '2026-11', fraction: 3 / 8, showYear: false },
      { month: '2026-10', fraction: 5 / 8, showYear: false },
      { month: '2026-09', fraction: 7 / 8, showYear: false },
    ])
  })

  it('너무 붙는 눈금은 건너뛴다 — 년도 눈금은 앞 눈금을 밀어내고 남는다', () => {
    const days = [
      '2027-02-01',
      '2027-01-01',
      '2026-12-05',
      '2026-12-04',
      '2026-12-03',
      '2026-12-02',
      '2026-12-01',
      '2026-11-30',
      '2026-11-29',
      '2026-11-28',
    ].map(day)
    // 간격 0.15: 2027-02(0) 다음 2027-01(0.1)은 붙어서 빠지고, 2026-12(0.2)는 년도라 남는다.
    // 2026-11(0.7)은 충분히 떨어져 남는다.
    expect(monthTicks(days, 0.15).map((t) => t.month)).toEqual(['2027-02', '2026-12', '2026-11'])
  })

  it('년도 눈금이 바로 앞의 달 눈금과 붙으면 달 눈금을 지운다', () => {
    const days = [
      '2027-03-02',
      '2027-03-01',
      '2027-02-01',
      '2026-12-31',
      '2026-12-30',
      '2026-12-29',
      '2026-12-28',
      '2026-12-27',
    ].map(day)
    // 2027-02(0.25) 와 2026-12(0.375) 가 붙는다 — 해가 바뀌는 2026-12 가 남는다.
    expect(monthTicks(days, 0.2).map((t) => t.month)).toEqual(['2027-03', '2026-12'])
  })

  it('년도 눈금끼리 붙으면 먼저 온(위쪽) 눈금이 남는다', () => {
    const days = ['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30'].map(day)
    expect(monthTicks(days, 0.6).map((t) => t.month)).toEqual(['2027-01'])
  })

  it('빈 목록이면 눈금도 없다', () => {
    expect(monthTicks([], 0.1)).toEqual([])
  })
})
