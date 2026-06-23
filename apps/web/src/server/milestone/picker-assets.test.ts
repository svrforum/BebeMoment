import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listMilestonePickerAssets } from './picker-assets'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
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

describe('listMilestonePickerAssets', () => {
  it('excludes secret-story photos for the family role but includes them for owner', async () => {
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
        assetIds: [secretAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const familyView = await listMilestonePickerAssets(
      { familyId: family.id, viewerRole: 'family' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(familyView.map((a) => a.id)).toEqual([normalAsset.id])

    const ownerView = await listMilestonePickerAssets(
      { familyId: family.id, viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ownerView.map((a) => a.id).sort()).toEqual([normalAsset.id, secretAsset.id].sort())
  })
})
