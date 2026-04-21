import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './auth/signup'
import { resolveContext } from './context'
import { createFamily } from './family/create'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

describe('resolveContext', () => {
  it('returns null when userId is null', async () => {
    const ctx = await resolveContext({ userId: null, currentFamilyId: null }, db.prisma)
    expect(ctx.user).toBeNull()
    expect(ctx.family).toBeNull()
    expect(ctx.membership).toBeNull()
  })

  it('returns user but null family when no memberships', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const ctx = await resolveContext({ userId: user.id, currentFamilyId: null }, db.prisma)
    expect(ctx.user?.id).toBe(user.id)
    expect(ctx.family).toBeNull()
  })

  it('returns family and role when user is a member', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
    const ctx = await resolveContext({ userId: user.id, currentFamilyId: family.id }, db.prisma)
    expect(ctx.family?.id).toBe(family.id)
    expect(ctx.membership?.role).toBe('owner')
  })

  it("returns null family if currentFamilyId doesn't belong to user", async () => {
    const { user: u1 } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { user: u2 } = await signup(
      { email: 'c@d.com', password: 'password123', displayName: 'C' },
      db.prisma,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prisma)
    const ctx = await resolveContext({ userId: u1.id, currentFamilyId: f2.id }, db.prisma)
    expect(ctx.family).toBeNull()
    expect(ctx.membership).toBeNull()
  })
})
