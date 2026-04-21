import { describe, expect, it } from 'vitest'
import { isInstanceAdmin, isInstanceAdminUser } from './admin'

describe('isInstanceAdmin', () => {
  it('returns false when list is empty', () => {
    expect(isInstanceAdmin('a@b.com', [])).toBe(false)
  })
  it('matches single email', () => {
    expect(isInstanceAdmin('a@b.com', ['a@b.com'])).toBe(true)
  })
  it('matches case-insensitively', () => {
    expect(isInstanceAdmin('A@B.com', ['a@b.com'])).toBe(true)
    expect(isInstanceAdmin('a@b.com', ['A@B.com'])).toBe(true)
  })
  it('matches one of many', () => {
    expect(isInstanceAdmin('c@d.com', ['a@b.com', 'c@d.com'])).toBe(true)
  })
  it('returns false when email is null', () => {
    expect(isInstanceAdmin(null, ['a@b.com'])).toBe(false)
  })
})

describe('isInstanceAdminUser', () => {
  it('returns false when user is null', () => {
    expect(isInstanceAdminUser(null, ['a@b.com'])).toBe(false)
  })
  it('returns false when email unverified even if listed', () => {
    expect(
      isInstanceAdminUser({ email: 'a@b.com', emailVerified: false }, ['a@b.com']),
    ).toBe(false)
  })
  it('returns true when verified and listed', () => {
    expect(
      isInstanceAdminUser({ email: 'a@b.com', emailVerified: true }, ['a@b.com']),
    ).toBe(true)
  })
  it('returns false when verified but not listed', () => {
    expect(
      isInstanceAdminUser({ email: 'z@z.com', emailVerified: true }, ['a@b.com']),
    ).toBe(false)
  })
  it('returns false when email is null even if verified', () => {
    expect(isInstanceAdminUser({ email: null, emailVerified: true }, ['a@b.com'])).toBe(
      false,
    )
  })
  it('matches case-insensitively when verified', () => {
    expect(
      isInstanceAdminUser({ email: 'A@B.com', emailVerified: true }, ['a@b.com']),
    ).toBe(true)
  })
})
