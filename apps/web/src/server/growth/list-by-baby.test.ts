import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createGrowthRecord } from './create'
import { listGrowthByBaby } from './list-by-baby'
import { softDeleteGrowthRecord } from './soft-delete'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.growthRecord.deleteMany()
  await db.prisma.baby.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prisma,
  )
  return { user, family, baby }
}

describe('listGrowthByBaby', () => {
  it('returns records for baby in ascending measuredAt order, excluding deleted', async () => {
    const { user, family, baby } = await setup()
    await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-02-01',
        weightKg: 5,
        byUserId: user.id,
      },
      db.prisma,
    )
    await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-03-01',
        weightKg: 6,
        byUserId: user.id,
      },
      db.prisma,
    )
    const deleted = await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-04-01',
        weightKg: 7,
        byUserId: user.id,
      },
      db.prisma,
    )
    await softDeleteGrowthRecord(
      { id: deleted.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    const list = await listGrowthByBaby(family.id, baby.id, db.prisma)
    expect(list.map((r) => r.measuredAt.toISOString().slice(0, 10))).toEqual([
      '2026-02-01',
      '2026-03-01',
    ])
  })
})
