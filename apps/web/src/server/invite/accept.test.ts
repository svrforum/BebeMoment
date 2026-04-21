import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { acceptInvite } from './accept'
import { createInvite } from './create'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.invite.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

async function setup() {
  const { user: owner } = await signup(
    { email: 'o@n.com', password: 'password123', displayName: 'O' },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: owner.id }, db.prisma)
  const invite = await createInvite(
    { familyId: family.id, email: 'new@new.com', role: 'family', byUserId: owner.id },
    db.prisma,
  )
  return { owner, family, invite }
}

describe('acceptInvite', () => {
  it('creates membership for existing user', async () => {
    const { family, invite } = await setup()
    const { user: invitee } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prisma,
    )
    const result = await acceptInvite({ token: invite.token, userId: invitee.id }, db.prisma)
    expect(result.membership.userId).toBe(invitee.id)
    expect(result.membership.familyId).toBe(family.id)
    expect(result.membership.role).toBe('family')
  })

  it('rejects expired token', async () => {
    const { invite } = await setup()
    await db.prisma.invite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prisma,
    )
    await expect(acceptInvite({ token: invite.token, userId: user.id }, db.prisma)).rejects.toThrow(
      /expired/i,
    )
  })

  it('rejects already accepted token', async () => {
    const { invite } = await setup()
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prisma,
    )
    await acceptInvite({ token: invite.token, userId: user.id }, db.prisma)
    await expect(acceptInvite({ token: invite.token, userId: user.id }, db.prisma)).rejects.toThrow(
      /already accepted/i,
    )
  })

  it('rejects revoked token', async () => {
    const { invite } = await setup()
    await db.prisma.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    })
    const { user } = await signup(
      { email: 'new@new.com', password: 'password123', displayName: 'N' },
      db.prisma,
    )
    await expect(acceptInvite({ token: invite.token, userId: user.id }, db.prisma)).rejects.toThrow(
      /revoked/i,
    )
  })

  it('rejects if user email does not match invite email', async () => {
    const { invite } = await setup()
    const { user } = await signup(
      { email: 'other@other.com', password: 'password123', displayName: 'X' },
      db.prisma,
    )
    await expect(acceptInvite({ token: invite.token, userId: user.id }, db.prisma)).rejects.toThrow(
      /email/i,
    )
  })
})
