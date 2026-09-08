import { describe, expect, it } from 'vitest'
import { isAllowedBetterAuthPath } from './auth-blocked-paths'

describe('isAllowedBetterAuthPath', () => {
  it('allows only session lookup, sign-out and the health probe', () => {
    expect(isAllowedBetterAuthPath('/api/auth/get-session')).toBe(true)
    expect(isAllowedBetterAuthPath('/api/auth/sign-out')).toBe(true)
    expect(isAllowedBetterAuthPath('/api/auth/ok')).toBe(true)
    // trailing slash variant
    expect(isAllowedBetterAuthPath('/api/auth/sign-out/')).toBe(true)
  })

  it('blocks the native credential sign-up / sign-in endpoints', () => {
    expect(isAllowedBetterAuthPath('/api/auth/sign-up/email')).toBe(false)
    expect(isAllowedBetterAuthPath('/api/auth/sign-in/email')).toBe(false)
    expect(isAllowedBetterAuthPath('/api/auth/sign-in/email/')).toBe(false)
  })

  // 아무도 부르지 않는 나머지 엔드포인트 — update-user 는 검증 없이 name/image 를 바꿨다.
  it('blocks every other Better Auth endpoint', () => {
    for (const p of [
      '/api/auth/update-user',
      '/api/auth/change-password',
      '/api/auth/delete-user',
      '/api/auth/list-sessions',
      '/api/auth/callback/google',
      '/api/auth/sign-up',
      '/api/auth/get-session/extra',
      '/api/auth',
    ]) {
      expect(isAllowedBetterAuthPath(p), p).toBe(false)
    }
  })
})
