import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createBaby } from './create'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.baby.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: 'a@b.com', password: 'password123', displayName: 'A' },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
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
      db.prisma,
    )
    expect(baby.name).toBe('아기')
    expect(baby.familyId).toBe(family.id)
    expect(baby.birthDate.toISOString().slice(0, 10)).toBe('2026-01-15')
  })

  it('rejects non-member user', async () => {
    const { family } = await setup()
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prisma,
    )
    await expect(
      createBaby(
        { familyId: family.id, name: '아기', birthDate: '2026-01-15', byUserId: outsider.id },
        db.prisma,
      ),
    ).rejects.toThrow(/permission|member/i)
  })

  it('allows near-future birth date (due date for unborn baby)', async () => {
    const { user, family } = await setup()
    const dueDate = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
    const baby = await createBaby(
      { familyId: family.id, name: '예준', birthDate: dueDate, byUserId: user.id },
      db.prisma,
    )
    expect(baby.birthDate.toISOString().slice(0, 10)).toBe(dueDate)
  })

  it('rejects birth date beyond 1 year in the future', async () => {
    const { user, family } = await setup()
    const tooFar = new Date(Date.now() + 500 * 86400_000).toISOString().slice(0, 10)
    await expect(
      createBaby(
        { familyId: family.id, name: '아기', birthDate: tooFar, byUserId: user.id },
        db.prisma,
      ),
    ).rejects.toThrow(/1년/)
  })
})
