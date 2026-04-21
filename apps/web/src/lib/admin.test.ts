import { describe, expect, it } from 'vitest'
import { isInstanceAdmin } from './admin'

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
