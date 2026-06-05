import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createGrowthRecord } from './create'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
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

describe('createGrowthRecord', () => {
  it('creates a record with all three measurements', async () => {
    const { user, family, baby } = await setup()
    const rec = await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-04-15',
        heightCm: 65.5,
        weightKg: 7.2,
        headCm: 43.1,
        note: '정기검진',
        byUserId: user.id,
      },
      db.prismaPublic,
    )
    expect(rec.familyId).toBe(family.id)
    expect(Number(rec.heightCm)).toBe(65.5)
    expect(Number(rec.weightKg)).toBe(7.2)
    expect(Number(rec.headCm)).toBe(43.1)
  })

  it('allows only one measurement present', async () => {
    const { user, family, baby } = await setup()
    const rec = await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-04-15',
        weightKg: 7.2,
        byUserId: user.id,
      },
      db.prismaPublic,
    )
    expect(rec.heightCm).toBeNull()
    expect(Number(rec.weightKg)).toBe(7.2)
  })

  it('enqueues growth.created on success', async () => {
    const { user, family, baby } = await setup()
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})
    const rec = await createGrowthRecord(
      {
        familyId: family.id,
        babyId: baby.id,
        measuredAt: '2026-04-15',
        weightKg: 7,
        byUserId: user.id,
      },
      db.prismaPublic,
      enqueue,
    )
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      familyId: family.id,
      actorUserId: user.id,
      type: 'growth.created',
      payload: { recordId: rec.id, babyId: baby.id, visibility: 'guardians' },
    })
  })

  it('rejects when no measurement provided', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createGrowthRecord(
        { familyId: family.id, babyId: baby.id, measuredAt: '2026-04-15', byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/at least one/i)
  })

  it('rejects future date', async () => {
    const { user, family, baby } = await setup()
    const future = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
    await expect(
      createGrowthRecord(
        {
          familyId: family.id,
          babyId: baby.id,
          measuredAt: future,
          weightKg: 7,
          byUserId: user.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/future/i)
  })

  it('rejects out-of-range values', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createGrowthRecord(
        {
          familyId: family.id,
          babyId: baby.id,
          measuredAt: '2026-04-15',
          weightKg: 999,
          byUserId: user.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('rejects non-member user', async () => {
    const { family, baby } = await setup()
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prismaPublic,
    )
    await expect(
      createGrowthRecord(
        {
          familyId: family.id,
          babyId: baby.id,
          measuredAt: '2026-04-15',
          weightKg: 7,
          byUserId: outsider.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission|member/i)
  })

  it('rejects creation by a family-role member', async () => {
    const { family, baby } = await setup()
    const { user: member } = await signup(
      {
        email: `fam-${Date.now()}-${Math.random()}@b.com`,
        password: 'password123',
        displayName: 'M',
      },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: member.id, role: 'family' },
    })
    await expect(
      createGrowthRecord(
        {
          familyId: family.id,
          babyId: baby.id,
          measuredAt: '2026-04-15',
          heightCm: 70,
          byUserId: member.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/No permission/i)
  })

  it('rejects when baby belongs to another family', async () => {
    const { user, baby } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prismaPublic)
    await expect(
      createGrowthRecord(
        {
          familyId: family2.id,
          babyId: baby.id,
          measuredAt: '2026-04-15',
          weightKg: 7,
          byUserId: user.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/baby/i)
  })
})
