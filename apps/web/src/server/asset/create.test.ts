import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'

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

async function setup() {
  const { user } = await signup(
    { email: 'a@b.com', password: 'password123', displayName: 'A' },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
  return { user, family }
}

describe('createAsset', () => {
  it('creates asset row with status=uploading', async () => {
    const { user, family } = await setup()
    const asset = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        originalKey: 'placeholder',
        sizeBytes: 0n,
        sha256: 'a'.repeat(64),
        takenAt: new Date('2026-01-01'),
        takenAtSource: 'manual',
      },
      db.prisma,
    )
    expect(asset.status).toBe('uploading')
    expect(asset.familyId).toBe(family.id)
    expect(asset.kind).toBe('image')
  })

  it('rejects non-member user', async () => {
    const { family } = await setup()
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prisma,
    )
    await expect(
      createAsset(
        {
          familyId: family.id,
          uploadedByUserId: outsider.id,
          kind: 'image',
          originalFilename: 'photo.jpg',
          mimeType: 'image/jpeg',
          originalKey: 'placeholder',
          sizeBytes: 0n,
          sha256: 'a'.repeat(64),
          takenAt: new Date(),
          takenAtSource: 'uploaded',
        },
        db.prisma,
      ),
    ).rejects.toThrow(/permission|member/i)
  })
})
