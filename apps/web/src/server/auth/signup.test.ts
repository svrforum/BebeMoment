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
    ).rejects.toThrow('auth.emailTaken')
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

describe('signup with username', () => {
  it('creates a user with username and null email', async () => {
    const { user } = await signup(
      { username: 'MinJun', password: 'password123', displayName: '민준아빠' },
      db.prismaPublic,
    )
    expect(user.username).toBe('minjun')
    expect(user.email).toBeNull()
    const account = await db.prismaPublic.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })
    expect(account?.password).toBeTruthy()
  })

  it('accepts optional email alongside username', async () => {
    const { user } = await signup(
      { username: 'dad', password: 'password123', displayName: 'D', email: 'd@x.com' },
      db.prismaPublic,
    )
    expect(user.username).toBe('dad')
    expect(user.email).toBe('d@x.com')
  })

  it('rejects invalid username', async () => {
    await expect(
      signup({ username: 'ab', password: 'password123', displayName: 'X' }, db.prismaPublic),
    ).rejects.toThrow('auth.usernameInvalid')
  })

  it('rejects duplicate username (case-insensitive)', async () => {
    await signup({ username: 'dad', password: 'password123', displayName: 'D' }, db.prismaPublic)
    await expect(
      signup({ username: 'DAD', password: 'password123', displayName: 'D2' }, db.prismaPublic),
    ).rejects.toThrow('auth.usernameTaken')
  })

  it('requires at least one of username or email', async () => {
    await expect(
      signup({ password: 'password123', displayName: 'X' }, db.prismaPublic),
    ).rejects.toThrow(/아이디 또는 이메일/)
  })
})
