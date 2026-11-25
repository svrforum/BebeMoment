import { describe, expect, it } from 'vitest'
import { identityFromClaims } from './identity'

describe('identityFromClaims', () => {
  it('trusts the signed id_token over userinfo for subject and email', () => {
    expect(
      identityFromClaims(
        { sub: 'tok-sub', email: 'tok@example.com', email_verified: true },
        { sub: 'info-sub', email: 'info@example.com', email_verified: false, name: 'N' },
      ),
    ).toEqual({
      subject: 'tok-sub',
      email: 'tok@example.com',
      emailVerified: true,
      displayName: 'N',
    })
  })

  it('falls back to userinfo and treats a missing email_verified as unverified', () => {
    expect(identityFromClaims({}, { sub: 'info-sub', email: 'info@example.com' })).toEqual({
      subject: 'info-sub',
      email: 'info@example.com',
      emailVerified: false,
    })
  })

  it('takes the display name from name, then nickname, userinfo before id_token', () => {
    const base = { sub: 's' }
    expect(identityFromClaims({ name: 'T' }, { ...base, nickname: 'Nick' }).displayName).toBe(
      'Nick',
    )
    expect(identityFromClaims({ nickname: 'TN', name: 'T' }, base).displayName).toBe('TN')
    expect(identityFromClaims({ name: 'T' }, base).displayName).toBe('T')
    expect(identityFromClaims({}, base)).not.toHaveProperty('displayName')
  })
})
