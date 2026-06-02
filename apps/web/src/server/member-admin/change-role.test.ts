import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { changeMemberRole } from './change-role'

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

describe('changeMemberRole', () => {
  it('가족 → 보호자로 역할을 올린다', async () => {
    const { owner, family, membership } = await setup()
    const result = await changeMemberRole(
      { membershipId: membership.id, familyId: family.id, actorUserId: owner.id, role: 'guardian' },
      db.prismaPublic,
    )
    expect(result.role).toBe('guardian')
    const updated = await db.prismaPublic.membership.findFirst({ where: { id: membership.id } })
    expect(updated?.role).toBe('guardian')
  })

  it('owner 역할로는 변경할 수 없다', async () => {
    const { owner, family, membership } = await setup()
    await expect(
      changeMemberRole(
        { membershipId: membership.id, familyId: family.id, actorUserId: owner.id, role: 'owner' },
        db.prismaPublic,
      ),
    ).rejects.toThrow('지정할 수 없는')
  })

  it('owner 가 아닌 actor 의 역할 변경을 거부한다', async () => {
    const { family, membership } = await setup()
    const { user: guardian } = await signup(
      { username: 'guardian', password: 'password123', displayName: '삼촌' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    await expect(
      changeMemberRole(
        {
          membershipId: membership.id,
          familyId: family.id,
          actorUserId: guardian.id,
          role: 'guardian',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow('소유자')
  })

  it('본인 역할은 변경할 수 없다', async () => {
    const { owner, family } = await setup()
    const ownerMembership = await db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: owner.id },
    })
    await expect(
      changeMemberRole(
        {
          membershipId: ownerMembership!.id,
          familyId: family.id,
          actorUserId: owner.id,
          role: 'family',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow('본인')
  })
})
