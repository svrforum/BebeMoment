import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createInvite } from '../invite/create'
import { isRegistrationOpen, validateInviteForSignup } from './registration'

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

describe('validateInviteForSignup', () => {
  async function makeInvite(email = 'new@new.com') {
    const { user: owner } = await signup(
      { email: 'o@n.com', password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: owner.id }, db.prismaPublic)
    return createInvite(
      { familyId: family.id, email, role: 'family', byUserId: owner.id },
      db.prismaPublic,
    )
  }

  it('accepts a valid token with matching email (case-insensitive)', async () => {
    const invite = await makeInvite('New@New.com')
    expect(await validateInviteForSignup(invite.token, 'new@new.com', db.prismaPublic)).toBe(true)
  })

  it('rejects an unknown token', async () => {
    expect(await validateInviteForSignup('nope', 'new@new.com', db.prismaPublic)).toBe(false)
  })

  it('rejects when email does not match', async () => {
    const invite = await makeInvite('new@new.com')
    expect(await validateInviteForSignup(invite.token, 'other@x.com', db.prismaPublic)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const invite = await makeInvite()
    await db.prismaPublic.invite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await validateInviteForSignup(invite.token, 'new@new.com', db.prismaPublic)).toBe(false)
  })

  it('rejects a revoked token', async () => {
    const invite = await makeInvite()
    await db.prismaPublic.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    })
    expect(await validateInviteForSignup(invite.token, 'new@new.com', db.prismaPublic)).toBe(false)
  })

  it('rejects an already-accepted token', async () => {
    const invite = await makeInvite()
    await db.prismaPublic.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    })
    expect(await validateInviteForSignup(invite.token, 'new@new.com', db.prismaPublic)).toBe(false)
  })
})
