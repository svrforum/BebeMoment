import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createGrowthRecord } from './create'
import { softDeleteGrowthRecord } from './soft-delete'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.growthRecord.deleteMany()
  await db.prismaPublic.baby.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

describe('softDeleteGrowthRecord', () => {
  it('soft-deletes own record', async () => {
    const { user, family, baby } = await setup()
    const rec = await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-04-15',
        weightKg: 7,
        byUserId: user.id,
      },
      db.prismaPublic,
    )
    await softDeleteGrowthRecord(
      { id: rec.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const fresh = await db.prismaPublic.growthRecord.findUnique({ where: { id: rec.id } })
    expect(fresh?.deletedAt).not.toBeNull()
  })
})
