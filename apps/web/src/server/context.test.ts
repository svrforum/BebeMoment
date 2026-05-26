import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './auth/signup'
import { resolveContext } from './context'
import { createFamily } from './family/create'

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
  await db.prismaPublic.appSetting.deleteMany()
})

describe('resolveContext', () => {
  it('returns null when userId is null', async () => {
    const ctx = await resolveContext({ userId: null, currentFamilyId: null }, db.prismaPublic)
    expect(ctx.user).toBeNull()
    expect(ctx.family).toBeNull()
    expect(ctx.membership).toBeNull()
  })

  it('returns user but null family when no memberships', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const ctx = await resolveContext({ userId: user.id, currentFamilyId: null }, db.prismaPublic)
    expect(ctx.user?.id).toBe(user.id)
    expect(ctx.family).toBeNull()
  })

  it('returns family and role when user is a member', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const ctx = await resolveContext(
      { userId: user.id, currentFamilyId: family.id },
      db.prismaPublic,
    )
    expect(ctx.family?.id).toBe(family.id)
    expect(ctx.membership?.role).toBe('owner')
  })

  it('exposes owner capabilities including asset.upload', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const ctx = await resolveContext(
      { userId: user.id, currentFamilyId: family.id },
      db.prismaPublic,
    )
    expect(ctx.capabilities).toContain('asset.upload')
  })

  it('gates family-role capabilities by the family permission setting', async () => {
    const { user: owner } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { user: member } = await signup(
      { email: 'm@b.com', password: 'password123', displayName: 'M' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: owner.id }, db.prismaPublic)
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: member.id, role: 'family' },
    })
    const ctx = await resolveContext(
      { userId: member.id, currentFamilyId: family.id },
      db.prismaPublic,
    )
    expect(ctx.membership?.role).toBe('family')
    expect(ctx.capabilities).not.toContain('asset.upload')
    expect(ctx.capabilities).toContain('social.comment.create')
  })

  it("returns null family if currentFamilyId doesn't belong to user", async () => {
    const { user: u1 } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { user: u2 } = await signup(
      { email: 'c@d.com', password: 'password123', displayName: 'C' },
      db.prismaPublic,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prismaPublic)
    const ctx = await resolveContext({ userId: u1.id, currentFamilyId: f2.id }, db.prismaPublic)
    expect(ctx.family).toBeNull()
    expect(ctx.membership).toBeNull()
  })
})
