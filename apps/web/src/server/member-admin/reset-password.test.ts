import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { issuePasswordReset } from './reset-password'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
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

describe('issuePasswordReset', () => {
  it('owner 가 아닌 actor(guardian)는 재설정할 수 없다', async () => {
    const { family, membership } = await setup()
    const { user: guardian } = await signup(
      { username: 'guardian1', password: 'password123', displayName: '이모' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    await expect(
      issuePasswordReset(
        {
          membershipId: membership.id,
          familyId: family.id,
          actorUserId: guardian.id,
          publicUrl: 'https://bebe.example.com',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/소유자/)
    const tokens = await db.prismaPublic.passwordResetToken.findMany()
    expect(tokens).toHaveLength(0)
  })
  it('토큰 URL 을 발급한다', async () => {
    const { owner, family, member, membership } = await setup()
    const result = await issuePasswordReset(
      {
        membershipId: membership.id,
        familyId: family.id,
        actorUserId: owner.id,
        publicUrl: 'https://bebe.example.com',
      },
      db.prismaPublic,
    )
    expect(result.url).toMatch(/^https:\/\/bebe\.example\.com\/reset-password\?token=[a-f0-9]{64}$/)
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now())
    const tokens = await db.prismaPublic.passwordResetToken.findMany({
      where: { userId: member.id, usedAt: null },
    })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.issuedByUserId).toBe(owner.id)
  })
  it('기존 미사용 토큰을 무효화하고 새로 발급한다', async () => {
    const { owner, family, member, membership } = await setup()
    await issuePasswordReset(
      {
        membershipId: membership.id,
        familyId: family.id,
        actorUserId: owner.id,
        publicUrl: 'https://x',
      },
      db.prismaPublic,
    )
    await issuePasswordReset(
      {
        membershipId: membership.id,
        familyId: family.id,
        actorUserId: owner.id,
        publicUrl: 'https://x',
      },
      db.prismaPublic,
    )
    const unused = await db.prismaPublic.passwordResetToken.findMany({
      where: { userId: member.id, usedAt: null },
    })
    expect(unused).toHaveLength(1)
    const all = await db.prismaPublic.passwordResetToken.findMany({ where: { userId: member.id } })
    expect(all).toHaveLength(2)
  })
  it('본인은 거부한다', async () => {
    const { owner, family } = await setup()
    const ownerMembership = await db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: owner.id },
    })
    await expect(
      issuePasswordReset(
        {
          membershipId: ownerMembership!.id,
          familyId: family.id,
          actorUserId: owner.id,
          publicUrl: 'https://x',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow('본인')
  })
  it('credential 계정이 없는 OIDC 멤버는 거부한다', async () => {
    const { owner, family } = await setup()
    const oidcUser = await db.prismaPublic.user.create({
      data: { username: 'oidcuser', displayName: 'OIDC', email: 'o@oidc.com' },
    })
    const oidcMembership = await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: oidcUser.id, role: 'family' },
    })
    await expect(
      issuePasswordReset(
        {
          membershipId: oidcMembership.id,
          familyId: family.id,
          actorUserId: owner.id,
          publicUrl: 'https://x',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow('OIDC')
  })
})
