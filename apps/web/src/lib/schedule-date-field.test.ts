import { describe, expect, it } from 'vitest'
import { initialOnDate } from './schedule-date-field'

const TODAY = '2026-09-22'

describe('initialOnDate', () => {
  it('날짜 칸에서 열면 그 날로 시작한다', () => {
    expect(initialOnDate('2026-12-25', TODAY)).toBe('2026-12-25')
  })

  it('+ 버튼처럼 날짜 없이 열면 오늘로 시작한다', () => {
    expect(initialOnDate(null, TODAY)).toBe(TODAY)
    expect(initialOnDate(undefined, TODAY)).toBe(TODAY)
  })

  it('빈 문자열도 날짜가 없는 것으로 본다', () => {
    expect(initialOnDate('', TODAY)).toBe(TODAY)
  })
})
