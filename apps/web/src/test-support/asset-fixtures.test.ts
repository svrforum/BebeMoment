import { signup } from '@/server/auth/signup'
import { createFamily } from '@/server/family/create'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset, updateAssetStatus } from './asset-fixtures'
import { type FullTestDb, startFullTestDb } from './db'

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

const IMAGE = {
  kind: 'image',
  originalFilename: 'photo.jpg',
  mimeType: 'image/jpeg',
  originalKey: 'placeholder',
  sizeBytes: 0n,
  sha256: 'a'.repeat(64),
  takenAtSource: 'uploaded',
} as const

describe('createAsset', () => {
  it('creates asset row with status=uploading', async () => {
    const { user, family } = await setup()
    const asset = await createAsset(
      {
        ...IMAGE,
        familyId: family.id,
        uploadedByUserId: user.id,
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
        { ...IMAGE, familyId: family.id, uploadedByUserId: outsider.id, takenAt: new Date() },
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
        { ...IMAGE, familyId: family.id, uploadedByUserId: fam.id, takenAt: new Date() },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.uploadDenied')
  })
})

describe('updateAssetStatus', () => {
  async function uploading() {
    const { user, family } = await setup()
    const asset = await createAsset(
      {
        ...IMAGE,
        familyId: family.id,
        uploadedByUserId: user.id,
        originalKey: 'k',
        sizeBytes: 100n,
        takenAt: new Date(),
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    return { asset, family }
  }

  it('transitions to ready with derivatives', async () => {
    const { asset, family } = await uploading()
    const updated = await updateAssetStatus(
      {
        assetId: asset.id,
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
    const { asset, family } = await uploading()
    const updated = await updateAssetStatus(
      { assetId: asset.id, familyId: family.id, status: 'failed', processingError: 'OOM' },
      db.prismaMedia,
    )
    expect(updated.status).toBe('failed')
    expect(updated.processingError).toBe('OOM')
  })
})
