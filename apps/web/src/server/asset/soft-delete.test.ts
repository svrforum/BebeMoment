import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { softDeleteAsset } from './soft-delete'

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

describe('softDeleteAsset', () => {
  it('sets deletedAt on asset owned by uploader', async () => {
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
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    await softDeleteAsset({ assetId: a.id, familyId: family.id, byUserId: user.id }, db.prisma)
    const updated = await db.prisma.asset.findUnique({ where: { id: a.id } })
    expect(updated?.deletedAt).not.toBeNull()
  })

  it('rejects non-member user', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prisma,
    )
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
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
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    await expect(
      softDeleteAsset({ assetId: a.id, familyId: family.id, byUserId: outsider.id }, db.prisma),
    ).rejects.toThrow(/permission|member/i)
  })
})
