import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { suspendMember } from './suspend'

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

describe('suspendMember', () => {
  it('멤버를 정지하고 활성 세션을 모두 삭제한다', async () => {
    const { owner, family, member, membership } = await setup()
    await db.prismaPublic.session.create({
      data: { token: 't-1', userId: member.id, expiresAt: new Date(Date.now() + 60_000) },
    })
    const result = await suspendMember(
      {
        membershipId: membership.id,
        familyId: family.id,
        actorUserId: owner.id,
        reason: '실수 가입',
      },
      db.prismaPublic,
    )
    expect(result.suspendedAt).toBeInstanceOf(Date)
    const updated = await db.prismaPublic.membership.findFirst({
      where: { id: membership.id, familyId: family.id },
    })
    expect(updated?.suspendedAt).not.toBeNull()
    expect(updated?.suspendedReason).toBe('실수 가입')
    expect(updated?.suspendedByUserId).toBe(owner.id)
    const sessions = await db.prismaPublic.session.findMany({ where: { userId: member.id } })
    expect(sessions).toHaveLength(0)
  })
  it('본인은 정지할 수 없다', async () => {
    const { owner, family } = await setup()
    const ownerMembership = await db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: owner.id },
    })
    await expect(
      suspendMember(
        { membershipId: ownerMembership!.id, familyId: family.id, actorUserId: owner.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('본인')
  })
  it('이미 정지된 멤버는 다시 정지할 수 없다', async () => {
    const { owner, family, membership } = await setup()
    await suspendMember(
      { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
      db.prismaPublic,
    )
    await expect(
      suspendMember(
        { membershipId: membership.id, familyId: family.id, actorUserId: owner.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow('이미 정지')
  })
})
