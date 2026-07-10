import { describe, expect, it } from 'vitest'
import { oidcLoginErrorKey } from './oidc-login-error'

describe('oidcLoginErrorKey', () => {
  it('returns null when no error code', () => {
    expect(oidcLoginErrorKey(null)).toBeNull()
    expect(oidcLoginErrorKey(undefined)).toBeNull()
    expect(oidcLoginErrorKey('')).toBeNull()
  })

  it('maps known callback codes to their message key', () => {
    expect(oidcLoginErrorKey('suspended')).toBe('suspended')
    expect(oidcLoginErrorKey('invite_required')).toBe('inviteRequired')
    expect(oidcLoginErrorKey('setup_required')).toBe('setupRequired')
    expect(oidcLoginErrorKey('state')).toBe('state')
    expect(oidcLoginErrorKey('provider')).toBe('provider')
  })

  it('collapses the various transient OIDC failures onto the generic message', () => {
    expect(oidcLoginErrorKey('oidc')).toBe('oidc')
    expect(oidcLoginErrorKey('oidc_exchange')).toBe('oidc')
    expect(oidcLoginErrorKey('nonce')).toBe('oidc')
    expect(oidcLoginErrorKey('link_session')).toBe('oidc')
  })

  it('falls back to the generic message for any unknown code (never a dead end)', () => {
    expect(oidcLoginErrorKey('totally_unknown')).toBe('oidc')
  })
})
