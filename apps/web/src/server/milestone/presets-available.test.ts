import { MILESTONE_PRESETS } from '@bebe/core'
import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'
import { presetsAvailable } from './presets-available'

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

describe('presetsAvailable', () => {
  it('returns all presets with taken=false when none recorded', async () => {
    const { family, baby } = await setup()
    const list = await presetsAvailable(family.id, baby.id, db.prisma)
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
      db.prisma,
    )
    const list = await presetsAvailable(family.id, baby.id, db.prisma)
    const entry = list.find((p) => p.key === 'first_smile')
    expect(entry?.taken).toBe(true)
    const others = list.filter((p) => p.key !== 'first_smile')
    expect(others.every((p) => p.taken === false)).toBe(true)
  })
})
