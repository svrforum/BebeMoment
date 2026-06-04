import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: 'a@b.com', password: 'password123', displayName: 'A' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
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
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(asset.status).toBe('uploading')
    expect(asset.familyId).toBe(family.id)
    expect(asset.kind).toBe('image')
  })

  it('rejects non-member user', async () => {
    const { family } = await setup()
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prismaPublic,
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
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.uploadDenied')
  })

  it('rejects family-role member when upload not granted', async () => {
    const { family } = await setup()
    const { user: fam } = await signup(
      { email: 'fam@b.com', password: 'password123', displayName: 'Fam' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    await expect(
      createAsset(
        {
          familyId: family.id,
          uploadedByUserId: fam.id,
          kind: 'image',
          originalFilename: 'photo.jpg',
          mimeType: 'image/jpeg',
          originalKey: 'placeholder',
          sizeBytes: 0n,
          sha256: 'a'.repeat(64),
          takenAt: new Date(),
          takenAtSource: 'uploaded',
        },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.uploadDenied')
  })
})
