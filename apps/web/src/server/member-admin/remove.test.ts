import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { removeMember } from './remove'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.session.deleteMany()
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

describe('removeMember', () => {
  it('owner 가 아닌 actor(guardian)는 제외할 수 없다', async () => {
    const { family, membership } = await setup()
    const { user: guardian } = await signup(
      { username: 'guardian1', password: 'password123', displayName: '이모' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    await expect(
      removeMember(
        { membershipId: membership.id, familyId: family.id, actorUserId: guardian.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('member.ownerOnly')
    const updated = await db.prismaPublic.membership.findFirst({ where: { id: membership.id } })
    expect(updated?.deletedAt).toBeNull()
  })
  it('soft-delete 하고 세션을 삭제한다', async () => {
    const { owner, family, member, membership } = await setup()
    await db.prismaPublic.session.create({
      data: { token: 't-1', userId: member.id, expiresAt: new Date(Date.now() + 60_000) },
    })
    await removeMember(
      { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
      db.prismaPublic,
    )
    const updated = await db.prismaPublic.membership.findFirst({
      where: { id: membership.id, familyId: family.id },
    })
    expect(updated?.deletedAt).not.toBeNull()
    const sessions = await db.prismaPublic.session.findMany({ where: { userId: member.id } })
    expect(sessions).toHaveLength(0)
  })
  it('본인은 거부한다', async () => {
    const { owner, family } = await setup()
    const ownerMembership = await db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: owner.id },
    })
    await expect(
      removeMember(
        { membershipId: ownerMembership!.id, familyId: family.id, actorUserId: owner.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('member.selfAction')
  })
  it('owner 역할 멤버는 거부한다', async () => {
    const { owner, family, member, membership } = await setup()
    await db.prismaPublic.membership.update({
      where: { familyId_userId: { familyId: family.id, userId: member.id } },
      data: { role: 'owner' },
    })
    await expect(
      removeMember(
        { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('member.ownerRemove')
  })
})
