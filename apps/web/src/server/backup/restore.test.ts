import { describe, expect, it } from 'vitest'
import { isFatalPgRestoreError } from './restore'

describe('isFatalPgRestoreError', () => {
  it('pg_restore error: 라인이 있으면 치명(복구 실패로 본다)', () => {
    expect(
      isFatalPgRestoreError(
        'pg_restore: error: could not execute query: ERROR: relation "x" does not exist',
      ),
    ).toBe(true)
    expect(isFatalPgRestoreError('pg_restore: warning: errors ignored on restore: 3')).toBe(true)
  })

  it('순수 경고/빈 출력은 비치명(--if-exists 의 양성 노이즈)', () => {
    expect(isFatalPgRestoreError('pg_restore: warning: implied data-only restore')).toBe(false)
    expect(isFatalPgRestoreError('')).toBe(false)
  })
})
