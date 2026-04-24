import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createBaby } from './create'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.baby.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: 'a@b.com', password: 'password123', displayName: 'A' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

describe('createBaby', () => {
  it('creates a baby in the family', async () => {
    const { user, family } = await setup()
    const baby = await createBaby(
      {
        familyId: family.id,
        name: '아기',
        birthDate: '2026-01-15',
        byUserId: user.id,
      },
      db.prismaPublic,
    )
    expect(baby.name).toBe('아기')
    expect(baby.familyId).toBe(family.id)
    expect(baby.birthDate.toISOString().slice(0, 10)).toBe('2026-01-15')
  })

  it('rejects non-member user', async () => {
    const { family } = await setup()
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prismaPublic,
    )
    await expect(
      createBaby(
        { familyId: family.id, name: '아기', birthDate: '2026-01-15', byUserId: outsider.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission|member/i)
  })

  it('allows near-future birth date (due date for unborn baby)', async () => {
    const { user, family } = await setup()
    const dueDate = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
    const baby = await createBaby(
      { familyId: family.id, name: '예준', birthDate: dueDate, byUserId: user.id },
      db.prismaPublic,
    )
    expect(baby.birthDate.toISOString().slice(0, 10)).toBe(dueDate)
  })

  it('rejects birth date beyond 1 year in the future', async () => {
    const { user, family } = await setup()
    const tooFar = new Date(Date.now() + 500 * 86400_000).toISOString().slice(0, 10)
    await expect(
      createBaby(
        { familyId: family.id, name: '아기', birthDate: tooFar, byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/1년/)
  })
})
