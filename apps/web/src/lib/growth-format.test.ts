import { describe, expect, it } from 'vitest'
import { formatLastValue } from './growth-format'

describe('formatLastValue', () => {
  it('값이 null 이면 null 반환', () => {
    expect(formatLastValue(null, new Date('2026-05-20T00:00:00Z'), 'cm')).toBeNull()
  })

  it('값+단위와 UTC 기준 M/D 를 조합', () => {
    expect(formatLastValue(70.2, new Date('2026-05-20T00:00:00Z'), 'cm')).toBe('70.2cm (5/20)')
  })

  it('kg 단위도 동일하게 동작', () => {
    expect(formatLastValue(8.5, new Date('2026-01-03T00:00:00Z'), 'kg')).toBe('8.5kg (1/3)')
  })
})
