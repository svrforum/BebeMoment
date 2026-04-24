import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
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

async function setupWithRole(role: 'owner' | 'guardian' | 'family') {
  const { user } = await signup(
    { email: 'o@n.com', password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family, membership } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  if (role !== 'owner') {
    await db.prismaPublic.membership.update({ where: { id: membership.id }, data: { role } })
  }
  return { user, family }
}

describe('createInvite', () => {
  it('owner can create invite', async () => {
    const { user, family } = await setupWithRole('owner')
    const invite = await createInvite(
      { familyId: family.id, email: 'new@new.com', role: 'guardian', byUserId: user.id },
      db.prismaPublic,
    )
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('guardian can create invite', async () => {
    const { user, family } = await setupWithRole('guardian')
    const invite = await createInvite(
      { familyId: family.id, email: 'x@x.com', role: 'family', byUserId: user.id },
      db.prismaPublic,
    )
    expect(invite.id).toBeTruthy()
  })

  it('family role cannot create invite', async () => {
    const { user, family } = await setupWithRole('family')
    await expect(
      createInvite(
        { familyId: family.id, email: 'x@x.com', role: 'family', byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission/i)
  })

  it('duplicate active invite rejected', async () => {
    const { user, family } = await setupWithRole('owner')
    await createInvite(
      { familyId: family.id, email: 'dup@x.com', role: 'family', byUserId: user.id },
      db.prismaPublic,
    )
    await expect(
      createInvite(
        { familyId: family.id, email: 'dup@x.com', role: 'family', byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/already invited/i)
  })
})
