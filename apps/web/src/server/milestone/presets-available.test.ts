import { MILESTONE_PRESETS } from '@bebe/core'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'
import { presetsAvailable } from './presets-available'

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

describe('presetsAvailable', () => {
  it('returns all presets with taken=false when none recorded', async () => {
    const { family, baby } = await setup()
    const list = await presetsAvailable(family.id, baby.id, db.prismaPublic)
    expect(list.length).toBe(MILESTONE_PRESETS.length)
    expect(list.every((p) => p.taken === false)).toBe(true)
  })

  it('marks recorded preset as taken=true', async () => {
    const { user, family, baby } = await setup()
    await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'first_smile',
        achievedAt: '2026-03-01',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const list = await presetsAvailable(family.id, baby.id, db.prismaPublic)
    const entry = list.find((p) => p.key === 'first_smile')
    expect(entry?.taken).toBe(true)
    const others = list.filter((p) => p.key !== 'first_smile')
    expect(others.every((p) => p.taken === false)).toBe(true)
  })
})
