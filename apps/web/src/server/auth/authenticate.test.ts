import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { authenticate } from './authenticate'
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

describe('authenticate', () => {
  it('logs in by username', async () => {
    const { user } = await signup(
      { username: 'dad', password: 'password123', displayName: 'D' },
      db.prismaPublic,
    )
    const r = await authenticate({ identifier: 'DAD', password: 'password123' }, db.prismaPublic)
    expect(r?.id).toBe(user.id)
  })

  it('logs in by email when set', async () => {
    const { user } = await signup(
      { username: 'dad', email: 'd@x.com', password: 'password123', displayName: 'D' },
      db.prismaPublic,
    )
    const r = await authenticate(
      { identifier: 'd@x.com', password: 'password123' },
      db.prismaPublic,
    )
    expect(r?.id).toBe(user.id)
  })

  it('returns null on wrong password', async () => {
    await signup({ username: 'dad', password: 'password123', displayName: 'D' }, db.prismaPublic)
    expect(
      await authenticate({ identifier: 'dad', password: 'nope12345' }, db.prismaPublic),
    ).toBeNull()
  })

  it('returns null on unknown identifier', async () => {
    expect(
      await authenticate({ identifier: 'ghost', password: 'password123' }, db.prismaPublic),
    ).toBeNull()
  })
})
