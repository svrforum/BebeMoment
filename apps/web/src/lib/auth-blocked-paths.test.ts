import { describe, expect, it } from 'vitest'
import { isBlockedBetterAuthPath } from './auth-blocked-paths'

describe('isBlockedBetterAuthPath', () => {
  it('blocks the native credential sign-up / sign-in endpoints', () => {
    expect(isBlockedBetterAuthPath('/api/auth/sign-up/email')).toBe(true)
    expect(isBlockedBetterAuthPath('/api/auth/sign-in/email')).toBe(true)
    // trailing slash variant
    expect(isBlockedBetterAuthPath('/api/auth/sign-in/email/')).toBe(true)
  })

  it('allows other Better Auth endpoints (session, sign-out, social callback)', () => {
    expect(isBlockedBetterAuthPath('/api/auth/get-session')).toBe(false)
    expect(isBlockedBetterAuthPath('/api/auth/sign-out')).toBe(false)
    expect(isBlockedBetterAuthPath('/api/auth/callback/google')).toBe(false)
    expect(isBlockedBetterAuthPath('/api/auth/sign-up')).toBe(false)
  })
})
