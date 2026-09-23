import { describe, expect, it } from 'vitest'
import { monthDirection, monthIndex } from './month-direction'

describe('monthDirection', () => {
  it('다음 달이면 1, 이전 달이면 -1, 같은 달이면 0', () => {
    expect(monthDirection(monthIndex(2026, 8), monthIndex(2026, 9))).toBe(1)
    expect(monthDirection(monthIndex(2026, 8), monthIndex(2026, 7))).toBe(-1)
    expect(monthDirection(monthIndex(2026, 8), monthIndex(2026, 8))).toBe(0)
  })

  it('해가 바뀌는 경계도 앞뒤를 맞게 본다', () => {
    expect(monthDirection(monthIndex(2026, 11), monthIndex(2027, 0))).toBe(1)
    expect(monthDirection(monthIndex(2027, 0), monthIndex(2026, 11))).toBe(-1)
  })

  it('달력 선택기로 여러 달을 건너뛰어도 방향만 본다', () => {
    expect(monthDirection(monthIndex(2026, 8), monthIndex(2025, 2))).toBe(-1)
  })
})
