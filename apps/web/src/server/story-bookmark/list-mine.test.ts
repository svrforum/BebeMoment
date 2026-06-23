import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listMyStoryBookmarks } from './list-mine'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.storyBookmark.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
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
  return asset
}

describe('listMyStoryBookmarks secret filtering', () => {
  it('hides secret-story photos from the family role inside a bookmarked family-visible story', async () => {
    const { user, family } = await setup()
    const sharedAsset = await makeReadyAsset(family.id, user.id)
    const normalAsset = await makeReadyAsset(family.id, user.id)

    const familyStory = await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-01',
        body: 'family',
        assetIds: [sharedAsset.id, normalAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [sharedAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.storyBookmark.create({
      data: { entryId: familyStory.id, userId: user.id, familyId: family.id },
    })

    const familyView = await listMyStoryBookmarks(
      family.id,
      user.id,
      'family',
      {},
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(familyView.items).toHaveLength(1)
    expect(familyView.items[0]?.entry?.assets.map((ea) => ea.assetId)).toEqual([normalAsset.id])

    const ownerView = await listMyStoryBookmarks(
      family.id,
      user.id,
      'owner',
      {},
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ownerView.items[0]?.entry?.assets.map((ea) => ea.assetId).sort()).toEqual(
      [sharedAsset.id, normalAsset.id].sort(),
    )
  })
})
