import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { restoreAsset } from './restore'
import { softDeleteAsset } from './soft-delete'

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

describe('restoreAsset', () => {
  it('clears deletedAt for owner', async () => {
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
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteAsset(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await restoreAsset(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const restored = await db.prismaMedia.asset.findUnique({ where: { id: a.id } })
    expect(restored?.deletedAt).toBeNull()
  })
})
