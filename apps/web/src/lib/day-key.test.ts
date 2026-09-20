import { describe, expect, it } from 'vitest'
import { isSubmittableDayKey, localDayKey, utcDayKey } from './day-key'

describe('utcDayKey', () => {
  it('UTC 기준으로 자른다', () => {
    expect(utcDayKey(new Date('2026-09-05T23:59:59Z'))).toBe('2026-09-05')
    expect(utcDayKey(new Date('2026-09-06T00:00:00Z'))).toBe('2026-09-06')
  })

  it('자리수를 채운다', () => {
    expect(utcDayKey(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02')
  })
})

describe('localDayKey', () => {
  it('벽시계 기준으로 자른다 — UTC 로 밀리지 않는다', () => {
    // 로컬 자정 직후. toISOString().slice(0,10) 은 UTC+ 지역에서 어제를 내놓는다.
    const justAfterMidnight = new Date(2026, 8, 5, 0, 30, 0)
    expect(localDayKey(justAfterMidnight)).toBe('2026-09-05')
  })

  it('자리수를 채운다', () => {
    expect(localDayKey(new Date(2026, 0, 2, 12, 0, 0))).toBe('2026-01-02')
  })
})

describe('isSubmittableDayKey', () => {
  it('오늘까지의 실재하는 날짜만 통과시킨다', () => {
    expect(isSubmittableDayKey('2026-09-05', '2026-09-20')).toBe(true)
    expect(isSubmittableDayKey('2026-09-20', '2026-09-20')).toBe(true)
  })

  it('빈 값·형식 오류를 막는다 — 비운 채 올리면 이미 올라간 사진이 휴지통으로 간다', () => {
    expect(isSubmittableDayKey('', '2026-09-20')).toBe(false)
    expect(isSubmittableDayKey('2026-9-5', '2026-09-20')).toBe(false)
    expect(isSubmittableDayKey('어제', '2026-09-20')).toBe(false)
  })

  it('달력에 없는 날짜를 막는다', () => {
    expect(isSubmittableDayKey('2026-02-31', '2026-09-20')).toBe(false)
    expect(isSubmittableDayKey('2026-13-01', '2026-09-20')).toBe(false)
  })

  it('미래 날짜를 막는다', () => {
    expect(isSubmittableDayKey('2026-09-21', '2026-09-20')).toBe(false)
    expect(isSubmittableDayKey('2099-12-31', '2026-09-20')).toBe(false)
  })
})
