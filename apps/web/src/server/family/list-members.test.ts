import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from './create'
import { listFamilyMembers } from './list-members'

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

describe('listFamilyMembers — 정지/제외', () => {
  it('membershipId·suspendedAt 을 노출하고 제외 멤버는 맨 뒤에 둔다', async () => {
    const { user: owner } = await signup(
      { username: 'owner', password: 'password123', displayName: '아빠' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: '우리집', userId: owner.id }, db.prismaPublic)
    const { user: gran } = await signup(
      { username: 'gran', password: 'password123', displayName: '할머니' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: gran.id, role: 'family', suspendedAt: new Date() },
    })
    const { user: gone } = await signup(
      { username: 'gone', password: 'password123', displayName: '사촌' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: gone.id, role: 'family', deletedAt: new Date() },
    })

    const members = await listFamilyMembers(family.id, db.prismaPublic)
    expect(members).toHaveLength(3)
    expect(members[0]?.membershipId).toBeTruthy()
    const granRow = members.find((m) => m.displayName === '할머니')
    expect(granRow?.suspendedAt).not.toBeNull()
    expect(granRow?.removed).toBe(false)
    expect(members[members.length - 1]?.displayName).toBe('사촌')
    expect(members[members.length - 1]?.removed).toBe(true)
  })
})
