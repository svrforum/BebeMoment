import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
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

describe('updateAssetStatus', () => {
  it('transitions to ready with derivatives', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
    const a = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    const updated = await updateAssetStatus(
      {
        assetId: a.id,
        familyId: family.id,
        status: 'ready',
        derivatives: { thumb_sm: 'k-sm.webp' },
      },
      db.prisma,
    )
    expect(updated.status).toBe('ready')
    expect(updated.derivatives).toEqual({ thumb_sm: 'k-sm.webp' })
  })

  it('transitions to failed with error message', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
    const a = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    const updated = await updateAssetStatus(
      { assetId: a.id, familyId: family.id, status: 'failed', processingError: 'OOM' },
      db.prisma,
    )
    expect(updated.status).toBe('failed')
    expect(updated.processingError).toBe('OOM')
  })
})
