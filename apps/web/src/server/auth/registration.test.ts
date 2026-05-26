import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { isRegistrationOpen } from './registration'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.invite.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('isRegistrationOpen', () => {
  it('is open when there are no families', async () => {
    expect(await isRegistrationOpen(db.prismaPublic)).toBe(true)
  })

  it('is closed once a family exists', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    expect(await isRegistrationOpen(db.prismaPublic)).toBe(false)
  })
})
