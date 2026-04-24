import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
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

describe('updateAssetStatus', () => {
  it('transitions to ready with derivatives', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
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
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateAssetStatus(
      {
        assetId: a.id,
        familyId: family.id,
        status: 'ready',
        derivatives: { thumb_sm: 'k-sm.webp' },
      },
      db.prismaMedia,
    )
    expect(updated.status).toBe('ready')
    expect(updated.derivatives).toEqual({ thumb_sm: 'k-sm.webp' })
  })

  it('transitions to failed with error message', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
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
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateAssetStatus(
      { assetId: a.id, familyId: family.id, status: 'failed', processingError: 'OOM' },
      db.prismaMedia,
    )
    expect(updated.status).toBe('failed')
    expect(updated.processingError).toBe('OOM')
  })
})
