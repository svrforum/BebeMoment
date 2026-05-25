import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { login } from './login'
import { signup } from './signup'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.user.deleteMany()
  await signup(
    { email: 'u@e.com', password: 'correct-password', displayName: 'U' },
    db.prismaPublic,
  )
})

describe('login', () => {
  it('returns user on correct credentials', async () => {
    const { user } = await login(
      { email: 'u@e.com', password: 'correct-password' },
      db.prismaPublic,
    )
    expect(user.email).toBe('u@e.com')
  })

  it('throws on wrong password', async () => {
    await expect(login({ email: 'u@e.com', password: 'wrong' }, db.prismaPublic)).rejects.toThrow(
      /invalid/i,
    )
  })

  it('throws on unknown email (no enumeration)', async () => {
    await expect(
      login({ email: 'x@x.com', password: 'anything' }, db.prismaPublic),
    ).rejects.toThrow(/invalid/i)
  })
})
