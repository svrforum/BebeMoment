import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { getAssetForFamily } from './get'
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

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeAsset(familyId: string, userId: string, sha: string) {
  return createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: sha.padEnd(64, '0'),
      takenAt: new Date('2026-04-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
}

describe('getAssetForFamily', () => {
  it('returns null for unknown asset', async () => {
    const { family } = await setup()
    const media = new FakeMediaClient()
    const found = await getAssetForFamily(
      { assetId: '00000000-0000-0000-0000-000000000000', familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(found).toBeNull()
  })

  it('returns null for asset in another family', async () => {
    const { user, family } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prismaPublic)
    const a = await makeAsset(family.id, user.id, 'x1')
    const media = new FakeMediaClient()
    const found = await getAssetForFamily(
      { assetId: a.id, familyId: family2.id },
      db.prismaMedia,
      media,
    )
    expect(found).toBeNull()
  })

  it('ready asset gets urls from media client', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id, 'r1')
    await updateAssetStatus({ assetId: a.id, familyId: family.id, status: 'ready' }, db.prismaMedia)
    const media = new FakeMediaClient()
    const found = await getAssetForFamily(
      { assetId: a.id, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(found?.id).toBe(a.id)
    expect(found?.urls).not.toBeNull()
    expect(media.calls.getAssetUrls).toHaveLength(1)
    expect(media.calls.getAssetUrls[0]).toEqual({ assetId: a.id, familyId: family.id })
  })

  it('non-ready asset returns urls=null without calling media', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id, 'p1')
    const media = new FakeMediaClient()
    const found = await getAssetForFamily(
      { assetId: a.id, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(found?.id).toBe(a.id)
    expect(found?.urls).toBeNull()
    expect(media.calls.getAssetUrls).toHaveLength(0)
  })
})
