import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAlbum } from './create'
import { listAlbumAssets } from './list-assets'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.albumAsset.deleteMany()
  await db.prismaPublic.album.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0
async function makeReadyAsset(familyId: string, userId: string) {
  counter += 1
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date('2026-04-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset.id
}

describe('listAlbumAssets secret filtering', () => {
  it('hides secret-story photos from the family role but shows them to owner', async () => {
    const { user } = await signup(
      { email: `t-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const normalAsset = await makeReadyAsset(family.id, user.id)
    const secretAsset = await makeReadyAsset(family.id, user.id)

    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secretAsset],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const album = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Trip' },
      db.prismaPublic,
    )
    await db.prismaPublic.albumAsset.createMany({
      data: [
        {
          albumId: album.id,
          familyId: family.id,
          assetId: normalAsset,
          sortIndex: 0,
          addedByUserId: user.id,
        },
        {
          albumId: album.id,
          familyId: family.id,
          assetId: secretAsset,
          sortIndex: 1,
          addedByUserId: user.id,
        },
      ],
    })

    const familyView = await listAlbumAssets(
      { albumId: album.id, familyId: family.id, viewerRole: 'family' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(familyView.assets.map((a) => a.id)).toEqual([normalAsset])
    expect(familyView.total).toBe(1)

    const ownerView = await listAlbumAssets(
      { albumId: album.id, familyId: family.id, viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ownerView.assets.map((a) => a.id).sort()).toEqual([normalAsset, secretAsset].sort())
    expect(ownerView.total).toBe(2)
  })
})
