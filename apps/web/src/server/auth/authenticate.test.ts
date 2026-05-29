import { ServiceError } from '@/server/error'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createFamily } from '../family/create'
import { authenticate } from './authenticate'
import { signup } from './signup'

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

describe('authenticate', () => {
  it('logs in by username', async () => {
    const { user } = await signup(
      { username: 'dad', password: 'password123', displayName: 'D' },
      db.prismaPublic,
    )
    const r = await authenticate({ identifier: 'DAD', password: 'password123' }, db.prismaPublic)
    expect(r?.id).toBe(user.id)
  })

  it('logs in by email when set', async () => {
    const { user } = await signup(
      { username: 'dad', email: 'd@x.com', password: 'password123', displayName: 'D' },
      db.prismaPublic,
    )
    const r = await authenticate(
      { identifier: 'd@x.com', password: 'password123' },
      db.prismaPublic,
    )
    expect(r?.id).toBe(user.id)
  })

  it('returns null on wrong password', async () => {
    await signup({ username: 'dad', password: 'password123', displayName: 'D' }, db.prismaPublic)
    expect(
      await authenticate({ identifier: 'dad', password: 'nope12345' }, db.prismaPublic),
    ).toBeNull()
  })

  it('returns null on unknown identifier', async () => {
    expect(
      await authenticate({ identifier: 'ghost', password: 'password123' }, db.prismaPublic),
    ).toBeNull()
  })
})

describe('authenticate — 정지 가드', () => {
  it('정지된 멤버는 비번이 맞아도 차단한다', async () => {
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
      data: { familyId: family.id, userId: member.id, role: 'family', suspendedAt: new Date() },
    })
    await expect(
      authenticate({ identifier: 'member', password: 'password123' }, db.prismaPublic),
    ).rejects.toBeInstanceOf(ServiceError)
  })

  it('정상 멤버는 로그인된다', async () => {
    const { user: owner } = await signup(
      { username: 'owner', password: 'password123', displayName: '아빠' },
      db.prismaPublic,
    )
    await createFamily({ name: '우리집', userId: owner.id }, db.prismaPublic)
    const result = await authenticate(
      { identifier: 'owner', password: 'password123' },
      db.prismaPublic,
    )
    expect(result?.id).toBe(owner.id)
  })
})
