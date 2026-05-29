import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFamily } from '../family/create'
import { signup } from './signup'
import { isUserFullySuspended } from './suspension'

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
  await db.prismaPublic.account.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function makeMember(suspended: boolean) {
  const { user: owner } = await signup(
    { username: 'owner', password: 'password123', displayName: '아빠' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: '우리집', userId: owner.id }, db.prismaPublic)
  const { user: member } = await signup(
    { username: 'member', password: 'password123', displayName: '할머니' },
    db.prismaPublic,
  )
  await db.prismaPublic.membership.create({
    data: {
      familyId: family.id,
      userId: member.id,
      role: 'family',
      suspendedAt: suspended ? new Date() : null,
    },
  })
  return member
}

describe('isUserFullySuspended', () => {
  it('정지된 멤버는 true', async () => {
    const member = await makeMember(true)
    expect(await isUserFullySuspended(member.id, db.prismaPublic)).toBe(true)
  })
  it('정상 멤버는 false', async () => {
    const member = await makeMember(false)
    expect(await isUserFullySuspended(member.id, db.prismaPublic)).toBe(false)
  })
  it('멤버십이 없으면 false', async () => {
    const { user } = await signup(
      { username: 'nomember', password: 'password123', displayName: '신규' },
      db.prismaPublic,
    )
    expect(await isUserFullySuspended(user.id, db.prismaPublic)).toBe(false)
  })
})
