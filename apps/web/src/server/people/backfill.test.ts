import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { FACE_BACKFILL_BATCH, planFaceBackfill } from './backfill'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.face.deleteMany()
  await db.prismaMedia.person.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0
async function makeAsset(familyId: string, userId: string, opts?: { ready?: boolean }) {
  counter += 1
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date(2026, 3, (counter % 27) + 1),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  if (opts?.ready !== false) {
    await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  }
  return asset.id
}

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${counter}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

describe('planFaceBackfill', () => {
  it('picks only the photos that found no face', async () => {
    const { user, family } = await setup()
    const withFace = await makeAsset(family.id, user.id)
    const without = await makeAsset(family.id, user.id)
    const person = await db.prismaMedia.person.create({ data: { familyId: family.id } })
    await db.prismaMedia.face.create({
      data: {
        familyId: family.id,
        assetId: withFace,
        personId: person.id,
        bboxX: 0.1,
        bboxY: 0.1,
        bboxW: 0.2,
        bboxH: 0.2,
        detScore: 0.9,
      },
    })

    const missing = await planFaceBackfill(
      { familyId: family.id, scope: 'missing' },
      db.prismaMedia,
    )
    expect(missing.assetIds).toEqual([without])

    const all = await planFaceBackfill({ familyId: family.id, scope: 'all' }, db.prismaMedia)
    expect(all.assetIds.sort()).toEqual([withFace, without].sort())
  })

  it('leaves out photos that are deleted, unfinished, duplicates or videos', async () => {
    const { user, family } = await setup()
    const live = await makeAsset(family.id, user.id)
    const pending = await makeAsset(family.id, user.id, { ready: false })
    const trashed = await makeAsset(family.id, user.id)
    const alias = await makeAsset(family.id, user.id)
    await db.prismaMedia.asset.updateMany({
      where: { id: trashed, familyId: family.id },
      data: { deletedAt: new Date() },
    })
    await db.prismaMedia.asset.updateMany({
      where: { id: alias, familyId: family.id },
      data: { duplicateOf: live },
    })

    const r = await planFaceBackfill({ familyId: family.id, scope: 'all' }, db.prismaMedia)
    expect(r.assetIds).toEqual([live])
    expect(r.assetIds).not.toContain(pending)
  })

  it('stays inside another family', async () => {
    const a = await setup()
    const b = await setup()
    const mine = await makeAsset(a.family.id, a.user.id)
    await makeAsset(b.family.id, b.user.id)

    const r = await planFaceBackfill({ familyId: a.family.id, scope: 'all' }, db.prismaMedia)
    expect(r.assetIds).toEqual([mine])
  })

  it('caps a batch and says work is left', async () => {
    const { user, family } = await setup()
    for (let i = 0; i < 4; i++) await makeAsset(family.id, user.id)

    const r = await planFaceBackfill(
      { familyId: family.id, scope: 'all', limit: 2 },
      db.prismaMedia,
    )
    expect(r.plan.queued).toBe(2)
    expect(r.plan.remaining).toBe(1)

    const rest = await planFaceBackfill({ familyId: family.id, scope: 'all' }, db.prismaMedia)
    expect(rest.plan.queued).toBe(4)
    expect(rest.plan.remaining).toBe(0)
    expect(FACE_BACKFILL_BATCH).toBeGreaterThan(4)
  })
})
