import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'
import { listMilestonesByBaby } from './list-by-baby'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.milestoneAsset.deleteMany()
  await db.prisma.milestone.deleteMany()
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

describe('listMilestonesByBaby', () => {
  it('returns milestones in achievedAt desc order with empty assets array', async () => {
    const { user, family, baby } = await setup()
    await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'first_smile',
        achievedAt: '2026-02-01',
        byUserId: user.id,
      },
      db.prisma,
    )
    await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'rollover',
        achievedAt: '2026-04-01',
        byUserId: user.id,
      },
      db.prisma,
    )
    const list = await listMilestonesByBaby(family.id, baby.id, db.prisma)
    expect(list.map((m) => m.achievedAt.toISOString().slice(0, 10))).toEqual([
      '2026-04-01',
      '2026-02-01',
    ])
    expect(list[0]?.assets).toEqual([])
    expect(list[1]?.assets).toEqual([])
  })
})
