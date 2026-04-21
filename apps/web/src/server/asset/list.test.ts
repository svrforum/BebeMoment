import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { listAssets } from './list'
import { updateAssetStatus } from './update-status'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.asset.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

describe('listAssets', () => {
  it('returns only ready family assets, ordered by takenAt desc', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
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
      db.prisma,
    )
    await updateAssetStatus({ assetId: older.id, familyId: family.id, status: 'ready' }, db.prisma)
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
      db.prisma,
    )
    await updateAssetStatus({ assetId: newer.id, familyId: family.id, status: 'ready' }, db.prisma)
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
      db.prisma,
    )
    await updateAssetStatus(
      { assetId: processing.id, familyId: family.id, status: 'processing' },
      db.prisma,
    )

    const result = await listAssets({ familyId: family.id, limit: 10 }, db.prisma)
    expect(result.map((a) => a.id)).toEqual([newer.id, older.id])
  })
})
