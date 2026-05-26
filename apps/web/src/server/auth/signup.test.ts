import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './signup'

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

describe('signup helper', () => {
  it('creates a user with a credential account holding a bcrypt hash', async () => {
    const result = await signup(
      { email: 'alice@example.com', password: 'strong-password-1', displayName: 'Alice' },
      db.prismaPublic,
    )
    expect(result.user.email).toBe('alice@example.com')
    expect(result.user.passwordHash).toMatch(/^\$2[aby]\$/)

    const account = await db.prismaPublic.account.findFirst({
      where: { userId: result.user.id, providerId: 'credential' },
    })
    expect(account?.accountId).toBe(result.user.id)
    expect(account?.password).toMatch(/^\$2[aby]\$/)
  })

  it('rejects duplicate email', async () => {
    await signup(
      { email: 'a@b.com', password: 'strong-password-1', displayName: 'A' },
      db.prismaPublic,
    )
    await expect(
      signup(
        { email: 'a@b.com', password: 'strong-password-2', displayName: 'B' },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/이미 가입/)
  })

  it('rejects short password', async () => {
    await expect(
      signup({ email: 'a@b.com', password: 'short', displayName: 'A' }, db.prismaPublic),
    ).rejects.toThrow(/password|비밀번호/i)
  })

  it('rejects invalid email', async () => {
    await expect(
      signup(
        { email: 'not-email', password: 'strong-password-1', displayName: 'A' },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/email|이메일/i)
  })
})
