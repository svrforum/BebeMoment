import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './signup'
import { isUsernameTaken, isValidUsername, normalizeUsername } from './username'

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  MinJun  ')).toBe('minjun')
  })
})

describe('isValidUsername', () => {
  it('accepts ascii lowercase/digits/._-', () => {
    expect(isValidUsername('min_jun.2')).toBe(true)
    expect(isValidUsername('abc')).toBe(true)
  })
  it('rejects too short, too long, spaces, uppercase, korean, @', () => {
    expect(isValidUsername('ab')).toBe(false)
    expect(isValidUsername('a'.repeat(31))).toBe(false)
    expect(isValidUsername('min jun')).toBe(false)
    expect(isValidUsername('MinJun')).toBe(false)
    expect(isValidUsername('민준')).toBe(false)
    expect(isValidUsername('a@b')).toBe(false)
  })
})

describe('isUsernameTaken', () => {
  let db: FullTestDb
  beforeAll(async () => {
    db = await startFullTestDb()
  })
  afterAll(async () => {
    await db.stop()
  })
  beforeEach(async () => {
    await db.prismaPublic.account.deleteMany()
    await db.prismaPublic.user.deleteMany()
  })

  it('false when no user, true after one exists (case-insensitive)', async () => {
    expect(await isUsernameTaken('minjun', db.prismaPublic)).toBe(false)
    await signup({ username: 'minjun', password: 'password123', displayName: 'M' }, db.prismaPublic)
    expect(await isUsernameTaken('MINJUN', db.prismaPublic)).toBe(true)
  })
})
