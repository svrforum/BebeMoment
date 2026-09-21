import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createGrowthRecord } from './create'
import { updateGrowthRecord } from './update'

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

describe('updateGrowthRecord', () => {
  it('updates own record as family role', async () => {
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
    const updated = await updateGrowthRecord(
      {
        id: rec.id,
        familyId: family.id,
        patch: { weightKg: 7.5, note: '업데이트' },
        byUserId: user.id,
      },
      db.prismaPublic,
    )
    expect(Number(updated.weightKg)).toBe(7.5)
    expect(updated.note).toBe('업데이트')
  })

  // 머리둘레 입력은 제거했지만 컬럼은 남겨 뒀다(옛 인스턴스의 데이터를 파괴하지 않으려고).
  // 그 값이 다른 필드를 고치는 동안 조용히 사라지지 않는지 고정한다.
  it('keeps a legacy head measurement when another field is edited', async () => {
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
    await db.prismaPublic.growthRecord.updateMany({
      where: { id: rec.id, familyId: family.id },
      data: { headCm: 43.1 },
    })

    const updated = await updateGrowthRecord(
      { id: rec.id, familyId: family.id, patch: { weightKg: 7.5 }, byUserId: user.id },
      db.prismaPublic,
    )

    expect(Number(updated.weightKg)).toBe(7.5)
    expect(updated.headCm == null ? null : Number(updated.headCm)).toBe(43.1)
  })

  it('rejects editing a record created by another user without edit.any', async () => {
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
    const { user: other } = await signup(
      { email: 'o@o.com', password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    await expect(
      updateGrowthRecord(
        { id: rec.id, familyId: family.id, patch: { weightKg: 8 }, byUserId: other.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission/i)
  })
})
