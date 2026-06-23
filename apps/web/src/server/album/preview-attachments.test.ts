import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAlbum } from './create'
import { previewAttachmentsByAlbum } from './preview-attachments'

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
      originalKey: `o-${counter}`,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date('2026-03-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset.id
}

describe('previewAttachmentsByAlbum', () => {
  it('excludes hidden (secret) asset ids so they never become an album cover', async () => {
    const { user } = await signup(
      { email: `t-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const secretAsset = await makeReadyAsset(family.id, user.id)
    const normalAsset = await makeReadyAsset(family.id, user.id)
    const album = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Trip' },
      db.prismaPublic,
    )
    // secret added most-recently → would be the cover without the filter
    await db.prismaPublic.albumAsset.create({
      data: {
        albumId: album.id,
        familyId: family.id,
        assetId: normalAsset,
        sortIndex: 0,
        addedByUserId: user.id,
        addedAt: new Date('2026-04-01'),
      },
    })
    await db.prismaPublic.albumAsset.create({
      data: {
        albumId: album.id,
        familyId: family.id,
        assetId: secretAsset,
        sortIndex: 1,
        addedByUserId: user.id,
        addedAt: new Date('2026-04-02'),
      },
    })

    const withExclude = await previewAttachmentsByAlbum(
      { familyId: family.id, albumIds: [album.id], perAlbum: 4, excludeAssetIds: [secretAsset] },
      db.prismaPublic,
    )
    expect(withExclude.get(album.id)).toEqual([normalAsset])

    const noExclude = await previewAttachmentsByAlbum(
      { familyId: family.id, albumIds: [album.id], perAlbum: 4 },
      db.prismaPublic,
    )
    expect(noExclude.get(album.id)?.sort()).toEqual([normalAsset, secretAsset].sort())
  })
})
