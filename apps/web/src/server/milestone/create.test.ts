import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createMilestone } from './create'

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
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(ms.presetKey).toBe('first_smile')
    expect(ms.customLabel).toBeNull()
    expect(ms.familyId).toBe(family.id)
  })

  it('enqueues milestone.created on success', async () => {
    const { user, family, baby } = await setup()
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})
    const ms = await createMilestone(
      {
        familyId: family.id,
        babyId: baby.id,
        presetKey: 'first_smile',
        achievedAt: '2026-03-01',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
      enqueue,
    )
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      familyId: family.id,
      actorUserId: user.id,
      type: 'milestone.created',
      payload: { milestoneId: ms.id, babyId: baby.id },
    })
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
      db.prismaPublic,
      db.prismaMedia,
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
      db.prismaPublic,
      db.prismaMedia,
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
        db.prismaPublic,
        db.prismaMedia,
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
        db.prismaPublic,
        db.prismaMedia,
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
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/exactly one/i)
  })

  it('rejects asset from another family', async () => {
    const { user, family, baby } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prismaPublic)
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
      db.prismaPublic,
      db.prismaMedia,
    )
    await updateAssetStatus(
      { assetId: foreign.id, familyId: family2.id, status: 'ready' },
      db.prismaMedia,
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
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/assets/i)
  })
})
