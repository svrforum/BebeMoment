import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { login } from './login'
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
  await signup({ email: 'u@e.com', password: 'correct-password', displayName: 'U' }, db.prisma)
})

describe('login', () => {
  it('returns user on correct credentials', async () => {
    const { user } = await login({ email: 'u@e.com', password: 'correct-password' }, db.prisma)
    expect(user.email).toBe('u@e.com')
  })

  it('throws on wrong password', async () => {
    await expect(login({ email: 'u@e.com', password: 'wrong' }, db.prisma)).rejects.toThrow(
      /invalid/i,
    )
  })

  it('throws on unknown email (no enumeration)', async () => {
    await expect(login({ email: 'x@x.com', password: 'anything' }, db.prisma)).rejects.toThrow(
      /invalid/i,
    )
  })
})
