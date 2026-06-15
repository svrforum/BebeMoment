import { describe, expect, it } from 'vitest'
import { fromUtcInputValue, toUtcInputValue } from './taken-at-input'

describe('takenAt datetime-local input (UTC wall-clock)', () => {
  it('shows the UTC wall-clock in the input, not local time', () => {
    // 04:22Z 는 입력칸에도 04:22 로 보여야 한다(KST 13:22 로 밀리면 안 됨).
    expect(toUtcInputValue('2026-06-15T04:22:00.000Z')).toBe('2026-06-15T04:22')
  })

  it('round-trips without shifting (display value === stored value)', () => {
    const iso = '2026-06-15T04:22:00.000Z'
    expect(fromUtcInputValue(toUtcInputValue(iso))).toBe(iso)
  })

  it('parses an edited input as UTC wall-clock, not local', () => {
    // 사용자가 "2026-06-13 10:00" 으로 고치면 10:00Z 로 저장돼야 한다(01:00Z 로 밀리면 버그).
    expect(fromUtcInputValue('2026-06-13T10:00')).toBe('2026-06-13T10:00:00.000Z')
  })
})
