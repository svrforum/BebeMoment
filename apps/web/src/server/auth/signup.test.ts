import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './signup'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.user.deleteMany()
})

describe('signup', () => {
  it('creates a new user with hashed password', async () => {
    const result = await signup(
      { email: 'alice@example.com', password: 'strong-password-1', displayName: 'Alice' },
      db.prisma,
    )
    expect(result.user.email).toBe('alice@example.com')
    expect(result.user.passwordHash).not.toBe('strong-password-1')
    expect(result.user.passwordHash).toMatch(/^\$2[aby]\$/)
  })

  it('rejects duplicate email', async () => {
    await signup({ email: 'a@b.com', password: 'strong-password-1', displayName: 'A' }, db.prisma)
    await expect(
      signup({ email: 'a@b.com', password: 'strong-password-2', displayName: 'B' }, db.prisma),
    ).rejects.toThrow(/이미 가입/)
  })

  it('rejects short password', async () => {
    await expect(
      signup({ email: 'a@b.com', password: 'short', displayName: 'A' }, db.prisma),
    ).rejects.toThrow(/password/i)
  })

  it('rejects invalid email', async () => {
    await expect(
      signup({ email: 'not-email', password: 'strong-password-1', displayName: 'A' }, db.prisma),
    ).rejects.toThrow(/email/i)
  })
})
