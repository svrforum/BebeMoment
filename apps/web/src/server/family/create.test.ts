import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from './create'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('createFamily', () => {
  it('creates family and owner membership', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family, membership } = await createFamily(
      { name: '김씨네 가족', userId: user.id },
      db.prismaPublic,
    )
    expect(family.name).toBe('김씨네 가족')
    expect(family.slug).toMatch(/^[a-z0-9-]+$/)
    expect(membership.role).toBe('owner')
    expect(membership.familyId).toBe(family.id)
    expect(membership.userId).toBe(user.id)
  })

  it('generates unique slug on collision', async () => {
    const { user: u1 } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { user: u2 } = await signup(
      { email: 'c@d.com', password: 'password123', displayName: 'C' },
      db.prismaPublic,
    )
    const f1 = await createFamily({ name: 'Smith', userId: u1.id }, db.prismaPublic)
    const f2 = await createFamily({ name: 'Smith', userId: u2.id }, db.prismaPublic)
    expect(f1.family.slug).not.toBe(f2.family.slug)
  })
})
