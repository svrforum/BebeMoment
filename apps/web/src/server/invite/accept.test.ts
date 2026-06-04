import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { acceptInvite } from './accept'
import { createInvite } from './create'

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

async function setup() {
  const { user: owner } = await signup(
    { email: 'o@n.com', password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: owner.id }, db.prismaPublic)
  const invite = await createInvite(
    { familyId: family.id, email: 'new@new.com', role: 'family', byUserId: owner.id },
    db.prismaPublic,
  )
  return { owner, family, invite }
}

describe('acceptInvite', () => {
  it('creates membership for existing user', async () => {
    const { family, invite } = await setup()
    const { user: invitee } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prismaPublic,
    )
    const result = await acceptInvite({ token: invite.token, userId: invitee.id }, db.prismaPublic)
    expect(result.membership.userId).toBe(invitee.id)
    expect(result.membership.familyId).toBe(family.id)
    expect(result.membership.role).toBe('family')
  })

  it('rejects expired token', async () => {
    const { invite } = await setup()
    await db.prismaPublic.invite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prismaPublic,
    )
    await expect(
      acceptInvite({ token: invite.token, userId: user.id }, db.prismaPublic),
    ).rejects.toThrow('invite.expired')
  })

  it('rejects already accepted token', async () => {
    const { invite } = await setup()
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prismaPublic,
    )
    await acceptInvite({ token: invite.token, userId: user.id }, db.prismaPublic)
    await expect(
      acceptInvite({ token: invite.token, userId: user.id }, db.prismaPublic),
    ).rejects.toThrow('invite.alreadyAccepted')
  })

  it('rejects revoked token', async () => {
    const { invite } = await setup()
    await db.prismaPublic.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    })
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prismaPublic,
    )
    await expect(
      acceptInvite({ token: invite.token, userId: user.id }, db.prismaPublic),
    ).rejects.toThrow('invite.revoked')
  })

  it('accepts regardless of user email (token-only)', async () => {
    const { invite } = await setup()
    const { user } = await signup(
      { username: 'whoever', password: 'password123', displayName: 'W' },
      db.prismaPublic,
    )
    const r = await acceptInvite({ token: invite.token, userId: user.id }, db.prismaPublic)
    expect(r.membership.userId).toBe(user.id)
  })
})
