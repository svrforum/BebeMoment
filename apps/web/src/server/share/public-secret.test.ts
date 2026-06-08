import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createAlbum } from '../album/create'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { buildPhotoSetPreview } from './photo-set'
import { getPublicAlbumPreview } from './public-album'
import { getPublicStoryPreview } from './public-story'

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

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  const normal = await makeReadyAsset(family.id, user.id)
  const secret = await makeReadyAsset(family.id, user.id)
  // secret 자산을 비밀(guardians) 스토리에 넣어 "비밀 사진"으로 만든다.
  await createStoryEntry(
    {
      familyId: family.id,
      babyId: null,
      entryDate: '2026-04-02',
      body: 'secret',
      visibility: 'guardians',
      assetIds: [secret],
      byUserId: user.id,
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  return { user, family, normal, secret }
}

describe('public share secret exclusion', () => {
  it('buildPhotoSetPreview drops secret-story photos (selection/date/single)', async () => {
    const { family, normal, secret } = await setup()
    const preview = await buildPhotoSetPreview(
      [normal, secret],
      family.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(preview?.total).toBe(1)
    expect(preview?.ids).toEqual([normal])
  })

  it('single secret-photo share resolves to empty (total 0 → notfound)', async () => {
    const { family, secret } = await setup()
    const preview = await buildPhotoSetPreview(
      [secret],
      family.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(preview?.total).toBe(0)
  })

  it('getPublicAlbumPreview excludes secret photos from count and cover', async () => {
    const { user, family, normal, secret } = await setup()
    const album = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Trip' },
      db.prismaPublic,
    )
    await db.prismaPublic.albumAsset.createMany({
      data: [
        // secret 을 sort 앞에 둬, 제외 안 되면 표지가 secret 이 되도록.
        {
          albumId: album.id,
          familyId: family.id,
          assetId: secret,
          sortIndex: 0,
          addedByUserId: user.id,
        },
        {
          albumId: album.id,
          familyId: family.id,
          assetId: normal,
          sortIndex: 1,
          addedByUserId: user.id,
        },
      ],
    })
    const preview = await getPublicAlbumPreview(
      album.id,
      family.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(preview?.photoCount).toBe(1)
  })

  it('getPublicStoryPreview excludes a photo that is also in a secret story', async () => {
    const { user, family, normal, secret } = await setup()
    // 가족 공개 스토리에 normal + (비밀에도 속한) secret 둘 다 넣는다.
    const familyStory = await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-03',
        body: 'public story',
        visibility: 'family',
        assetIds: [normal, secret],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const preview = await getPublicStoryPreview(
      familyStory.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(preview?.totalPhotos).toBe(1)
  })
})
