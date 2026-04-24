import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'
import { listMilestonesByBaby } from './list-by-baby'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.milestoneAsset.deleteMany()
  await db.prismaPublic.milestone.deleteMany()
  await db.prismaMedia.asset.deleteMany()
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
      db.prismaPublic,
      db.prismaMedia,
    )
    await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'rollover',
        achievedAt: '2026-04-01',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const list = await listMilestonesByBaby(family.id, baby.id, db.prismaPublic, db.prismaMedia)
    expect(list.map((m) => m.achievedAt.toISOString().slice(0, 10))).toEqual([
      '2026-04-01',
      '2026-02-01',
    ])
    expect(list[0]?.assets).toEqual([])
    expect(list[1]?.assets).toEqual([])
  })
})
