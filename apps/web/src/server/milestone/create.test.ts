import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'

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
  await db.prisma.asset.deleteMany()
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

describe('createMilestone', () => {
  it('creates preset milestone', async () => {
    const { user, family, baby } = await setup()
    const ms = await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'first_smile',
        achievedAt: '2026-03-01',
        byUserId: user.id,
      },
      db.prisma,
    )
    expect(ms.presetKey).toBe('first_smile')
    expect(ms.customLabel).toBeNull()
    expect(ms.familyId).toBe(family.id)
  })

  it('creates custom milestone', async () => {
    const { user, family, baby } = await setup()
    const ms = await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        customLabel: '첫 박수',
        achievedAt: '2026-03-15',
        byUserId: user.id,
      },
      db.prisma,
    )
    expect(ms.presetKey).toBeNull()
    expect(ms.customLabel).toBe('첫 박수')
  })

  it('rejects duplicate preset for same baby', async () => {
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
    await expect(
      createMilestone(
        {
          familyId: family.id,
          babyId: baby.id,
          presetKey: 'first_smile',
          achievedAt: '2026-04-01',
          byUserId: user.id,
        },
        db.prisma,
      ),
    ).rejects.toThrow(/이미 기록/)
  })

  it('rejects unknown preset key', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createMilestone(
        {
          familyId: family.id,
          babyId: baby.id,
          presetKey: 'does_not_exist',
          achievedAt: '2026-03-01',
          byUserId: user.id,
        },
        db.prisma,
      ),
    ).rejects.toThrow(/unknown/i)
  })

  it('rejects providing both presetKey and customLabel', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createMilestone(
        {
          familyId: family.id,
          babyId: baby.id,
          presetKey: 'first_smile',
          customLabel: '중복',
          achievedAt: '2026-03-01',
          byUserId: user.id,
        },
        db.prisma,
      ),
    ).rejects.toThrow(/exactly one/i)
  })

  it('rejects asset from another family', async () => {
    const { user, family, baby } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prisma)
    const foreign = await createAsset(
      {
        familyId: family2.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'o1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'f'.repeat(64),
        takenAt: new Date('2026-03-01'),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    await updateAssetStatus(
      { assetId: foreign.id, familyId: family2.id, status: 'ready' },
      db.prisma,
    )
    await expect(
      createMilestone(
        {
          familyId: family.id,
          babyId: baby.id,
          presetKey: 'first_smile',
          achievedAt: '2026-03-01',
          byUserId: user.id,
          assetIds: [foreign.id],
        },
        db.prisma,
      ),
    ).rejects.toThrow(/assets/i)
  })
})
