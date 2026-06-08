import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { getPersonAssets, listPeople } from './list'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.face.deleteMany()
  await db.prismaMedia.person.deleteMany()
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

async function addFace(familyId: string, assetId: string, personId: string) {
  await db.prismaMedia.face.create({
    data: {
      familyId,
      assetId,
      personId,
      bboxX: 0.1,
      bboxY: 0.1,
      bboxW: 0.2,
      bboxH: 0.2,
      detScore: 0.9,
    },
  })
}

describe('people secret filtering', () => {
  it('drops secret-only people for family but keeps them for owner', async () => {
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

    const visiblePerson = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: 'Visible' },
    })
    const secretPerson = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: 'Secret' },
    })
    await addFace(family.id, normalAsset, visiblePerson.id)
    await addFace(family.id, secretAsset, secretPerson.id)

    const familyPeople = await listPeople(
      { familyId: family.id, viewerRole: 'family' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(familyPeople.map((p) => p.id)).toEqual([visiblePerson.id])

    const ownerPeople = await listPeople(
      { familyId: family.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(ownerPeople.map((p) => p.id).sort()).toEqual([visiblePerson.id, secretPerson.id].sort())

    // getPersonAssets: the secret person's photos are empty for family, present for owner.
    const familyDetail = await getPersonAssets(
      { familyId: family.id, personId: secretPerson.id, viewerRole: 'family' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(familyDetail.assets).toHaveLength(0)
    const ownerDetail = await getPersonAssets(
      { familyId: family.id, personId: secretPerson.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(ownerDetail.assets.map((a) => a.id)).toEqual([secretAsset])
  })
})
