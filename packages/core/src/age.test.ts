import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ageBucket, daysBetween, monthsBetween } from './age'

describe('daysBetween', () => {
  it('returns 0 for same day', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0)
  })
  it('returns 1 for next day', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-02'))).toBe(1)
  })
  it('ignores time-of-day', () => {
    expect(daysBetween(new Date('2026-01-01T23:00:00Z'), new Date('2026-01-02T01:00:00Z'))).toBe(1)
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

describe('ageBucket', () => {
  const birth = new Date('2026-01-01')
  it('태어난 날은 days 1', () => {
    expect(ageBucket(birth, new Date('2026-01-01'))).toEqual({ kind: 'days', n: 1 })
  })
  it('태어난 다음날은 days 2', () => {
    expect(ageBucket(birth, new Date('2026-01-02'))).toEqual({ kind: 'days', n: 2 })
  })
  it('46일 뒤는 days 47', () => {
    expect(ageBucket(birth, new Date('2026-02-16'))).toEqual({ kind: 'days', n: 47 })
  })
  it('days 의 마지막 날은 99', () => {
    expect(ageBucket(birth, new Date('2026-04-09'))).toEqual({ kind: 'days', n: 99 })
  })
  it('99일 뒤는 hundredDays 경계', () => {
    expect(ageBucket(birth, new Date('2026-04-10'))).toEqual({ kind: 'hundredDays', n: 100 })
  })
  it('100일 다음날은 months 3', () => {
    expect(ageBucket(birth, new Date('2026-04-11'))).toEqual({ kind: 'months', n: 3 })
  })
  it('만 1년 미만은 months (만 나이 없음)', () => {
    expect(ageBucket(birth, new Date('2026-12-15'))).toEqual({ kind: 'months', n: 11 })
  })
  it('정확히 1년 뒤는 anniversary 1', () => {
    expect(ageBucket(birth, new Date('2027-01-01'))).toEqual({ kind: 'anniversary', n: 1 })
  })
  it('2주년', () => {
    expect(ageBucket(birth, new Date('2028-01-01'))).toEqual({ kind: 'anniversary', n: 2 })
  })
  it('돌 이후는 개월수 + 만 나이', () => {
    expect(ageBucket(birth, new Date('2027-07-01'))).toEqual({
      kind: 'monthsWithYears',
      n: 18,
      years: 1,
    })
  })
  it('개월수가 커도 만 나이를 함께 (97개월 → 만 8세)', () => {
    // 2026-01-01 + 97개월 = 2034-02 → floor(97/12)=8
    expect(ageBucket(birth, new Date('2034-02-15'))).toEqual({
      kind: 'monthsWithYears',
      n: 97,
      years: 8,
    })
  })
  it('연 배수여도 날짜가 다르면 anniversary 아님', () => {
    expect(ageBucket(birth, new Date('2027-01-15'))).toEqual({
      kind: 'monthsWithYears',
      n: 12,
      years: 1,
    })
  })

  // 출산 예정일(birthDate)이 미래인 태아기 사진 — 출산까지 남은 일수 D-day 카운트다운
  it('출산 하루 전은 dday 1', () => {
    expect(ageBucket(birth, new Date('2025-12-31'))).toEqual({ kind: 'dday', n: 1 })
  })
  it('출산 119일 전은 dday 119', () => {
    expect(ageBucket(birth, new Date('2025-09-04'))).toEqual({ kind: 'dday', n: 119 })
  })
})

// 촬영 시각은 벽시계를 UTC 필드에 담고(wall-clock-as-UTC) 생일은 date 컬럼이라 UTC 자정으로
// 온다. 서버 로컬 시간대로 읽으면 운영(TZ=Asia/Seoul)에서 오후 3시 이후 사진이 다음 날 나이로
// 찍힌다. 어느 시간대 서버에서 돌아도 같은 답이어야 한다.
describe.each([
  ['UTC', 0],
  ['Asia/Seoul', -540],
  ['America/Los_Angeles', 420],
])('서버 시간대가 %s 여도 날짜는 UTC 로 읽는다', (zone, offset) => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.TZ
    process.env.TZ = zone
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  })

  it('정말 그 시간대에서 돈다', () => {
    expect(new Date('2026-10-11T21:30:00Z').getTimezoneOffset()).toBe(offset)
  })

  it('밤늦게 찍은 사진도 찍은 날로 센다', () => {
    const birth = new Date('2026-08-27')
    expect(ageBucket(birth, new Date('2026-10-11T21:30:00Z'))).toEqual({ kind: 'days', n: 46 })
    expect(ageBucket(birth, new Date('2026-10-12T08:00:00Z'))).toEqual({ kind: 'days', n: 47 })
  })

  it('생일 당일 밤에 찍은 사진은 주년이다', () => {
    expect(ageBucket(new Date('2026-01-01'), new Date('2027-01-01T23:30:00Z'))).toEqual({
      kind: 'anniversary',
      n: 1,
    })
  })

  it('개월수도 찍은 날로 센다 — 다 채우기 하루 전 밤은 아직 그 전 달', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-03-14T23:30:00Z'))).toBe(1)
  })
})
