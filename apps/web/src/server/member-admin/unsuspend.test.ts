import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { suspendMember } from './suspend'
import { unsuspendMember } from './unsuspend'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.session.deleteMany()
  await db.prismaPublic.passwordResetToken.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.account.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user: owner } = await signup(
    { username: 'owner', password: 'password123', displayName: '아빠' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: '우리집', userId: owner.id }, db.prismaPublic)
  const { user: member } = await signup(
    { username: 'member', password: 'password123', displayName: '할머니' },
    db.prismaPublic,
  )
  const membership = await db.prismaPublic.membership.create({
    data: { familyId: family.id, userId: member.id, role: 'family' },
  })
  return { owner, family, member, membership }
}

describe('unsuspendMember', () => {
  it('정지를 해제한다', async () => {
    const { owner, family, membership } = await setup()
    await suspendMember(
      { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
      db.prismaPublic,
    )
    await unsuspendMember(
      { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
      db.prismaPublic,
    )
    const updated = await db.prismaPublic.membership.findFirst({
      where: { id: membership.id, familyId: family.id },
    })
    expect(updated?.suspendedAt).toBeNull()
    expect(updated?.suspendedReason).toBeNull()
    expect(updated?.suspendedByUserId).toBeNull()
  })
  it('정지 상태가 아니면 거부한다', async () => {
    const { owner, family, membership } = await setup()
    await expect(
      unsuspendMember(
        { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('정지된 상태가 아니')
  })
})
