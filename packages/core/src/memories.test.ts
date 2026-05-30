import { describe, expect, it } from 'vitest'
import { intervalLabel, memoryInterval } from './memories'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('memoryInterval', () => {
  it('정확히 1년 전 같은 날 → year 1', () => {
    expect(memoryInterval(d('2026-05-30'), d('2025-05-30'))).toEqual({ kind: 'year', n: 1 })
  })
  it('정확히 6개월 전 같은 날 → month 6', () => {
    expect(memoryInterval(d('2026-05-30'), d('2025-11-30'))).toEqual({ kind: 'month', n: 6 })
  })
  it('정확히 2년 전 → year 2', () => {
    expect(memoryInterval(d('2026-05-30'), d('2024-05-30'))).toEqual({ kind: 'year', n: 2 })
  })
  it('13개월 전(같은 날, 연 배수 아님) → month 13 (아기 나이식 표현)', () => {
    expect(memoryInterval(d('2026-05-30'), d('2025-04-30'))).toEqual({ kind: 'month', n: 13 })
  })
  it('일(日)이 다르면 null', () => {
    expect(memoryInterval(d('2026-05-30'), d('2025-05-29'))).toBeNull()
  })
  it('미래/같은 날은 null', () => {
    expect(memoryInterval(d('2026-05-30'), d('2026-05-30'))).toBeNull()
    expect(memoryInterval(d('2026-05-30'), d('2026-06-30'))).toBeNull()
  })
  it('짧은 달 경계: 3/31 기준 2/28 은 일이 달라 매칭 안 됨', () => {
    expect(memoryInterval(d('2026-03-31'), d('2026-02-28'))).toBeNull()
  })
  it('1개월 전 같은 날 → month 1', () => {
    expect(memoryInterval(d('2026-05-30'), d('2026-04-30'))).toEqual({ kind: 'month', n: 1 })
  })
})

describe('intervalLabel', () => {
  it('year → N년 전 오늘', () => {
    expect(intervalLabel({ kind: 'year', n: 1 })).toBe('1년 전 오늘')
  })
  it('month → N개월 전 오늘', () => {
    expect(intervalLabel({ kind: 'month', n: 6 })).toBe('6개월 전 오늘')
  })
})
