import { describe, expect, it } from 'vitest'
import { bucketLabel, daysBetween, monthsBetween } from './age'

describe('daysBetween', () => {
  it('returns 0 for same day', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0)
  })
  it('returns 1 for next day', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(1)
  })
  it('ignores time-of-day', () => {
    expect(daysBetween(new Date('2026-01-01T23:00:00'), new Date('2026-01-02T01:00:00'))).toBe(1)
  })
  it('is stable across DST (uses UTC days)', () => {
    expect(daysBetween(new Date('2026-03-09'), new Date('2026-03-10'))).toBe(1)
  })
})

describe('monthsBetween', () => {
  it('exact months', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-03-15'))).toBe(2)
  })
  it('partial month returns floored value', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-02-10'))).toBe(0)
  })
})

describe('bucketLabel', () => {
  const birth = new Date('2026-01-01')
  it('태어난 날은 생후 1일', () => {
    expect(bucketLabel(birth, new Date('2026-01-01'))).toBe('생후 1일')
  })
  it('태어난 다음날은 생후 2일', () => {
    expect(bucketLabel(birth, new Date('2026-01-02'))).toBe('생후 2일')
  })
  it('46일 뒤는 생후 47일', () => {
    expect(bucketLabel(birth, new Date('2026-02-16'))).toBe('생후 47일')
  })
  it('99일 뒤는 생후 100일 경계', () => {
    expect(bucketLabel(birth, new Date('2026-04-10'))).toBe('100일')
  })
  it('100일 다음날은 "생후 3개월"', () => {
    expect(bucketLabel(birth, new Date('2026-04-11'))).toBe('생후 3개월')
  })
  it('생후 11개월', () => {
    expect(bucketLabel(birth, new Date('2026-12-15'))).toBe('생후 11개월')
  })
  it('정확히 1년 뒤는 "1주년 (돌)"', () => {
    expect(bucketLabel(birth, new Date('2027-01-01'))).toBe('1주년 (돌)')
  })
  it('돌 이후는 개월수로 돌아감', () => {
    expect(bucketLabel(birth, new Date('2027-07-01'))).toBe('생후 18개월')
  })
  it('2주년', () => {
    expect(bucketLabel(birth, new Date('2028-01-01'))).toBe('2주년')
  })
})
