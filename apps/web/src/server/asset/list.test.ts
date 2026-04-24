import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { listAssets } from './list'
import { updateAssetStatus } from './update-status'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('listAssets', () => {
  it('returns only ready family assets, ordered by takenAt desc', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const older = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'o1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: '1'.repeat(64),
        takenAt: new Date('2026-01-01'),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await updateAssetStatus(
      { assetId: older.id, familyId: family.id, status: 'ready' },
      db.prismaMedia,
    )
    const newer = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'o2',
        originalFilename: 'b.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: '2'.repeat(64),
        takenAt: new Date('2026-02-01'),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await updateAssetStatus(
      { assetId: newer.id, familyId: family.id, status: 'ready' },
      db.prismaMedia,
    )
    const processing = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'o3',
        originalFilename: 'c.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: '3'.repeat(64),
        takenAt: new Date('2026-03-01'),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await updateAssetStatus(
      { assetId: processing.id, familyId: family.id, status: 'processing' },
      db.prismaMedia,
    )

    const result = await listAssets({ familyId: family.id, limit: 10 }, db.prismaMedia)
    expect(result.map((a) => a.id)).toEqual([newer.id, older.id])
  })
})
