import { describe, expect, it } from 'vitest'
import { shouldAttemptVapidReload } from './vapid-reload'

describe('shouldAttemptVapidReload', () => {
  it('does not attempt when no public key is configured', () => {
    expect(shouldAttemptVapidReload(null, '')).toBe(false)
    expect(shouldAttemptVapidReload(undefined, '')).toBe(false)
    expect(shouldAttemptVapidReload('', 'abc')).toBe(false)
  })

  it('attempts when the latest key differs from the last attempted key', () => {
    expect(shouldAttemptVapidReload('newkey', '')).toBe(true)
    expect(shouldAttemptVapidReload('rotated', 'previous')).toBe(true)
  })

  // 회귀: 복호화 불가 키로 한 번 실패한 뒤, 같은 공개키를 매 잡마다 다시 시도해
  // 로그를 도배하던 버그. 실패한 시도도 "이미 시도함"으로 기록되면 같은 키엔 재시도 X.
  it('does not re-attempt the same key after a prior (failed) attempt', () => {
    expect(shouldAttemptVapidReload('samekey', 'samekey')).toBe(false)
  })
})
