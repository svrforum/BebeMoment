import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { getPersonAssets, listPeople, mergePeople } from './list'

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

describe('people photo count', () => {
  it('counts distinct photos (list matches detail) even with multiple faces per asset', async () => {
    const { user } = await signup(
      { email: `t-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)

    const a1 = await makeReadyAsset(family.id, user.id)
    const a2 = await makeReadyAsset(family.id, user.id)
    const person = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: null },
    })
    // 7 face rows but only 2 distinct assets (same person detected多 times on a1).
    await addFace(family.id, a1, person.id)
    await addFace(family.id, a1, person.id)
    await addFace(family.id, a1, person.id)
    await addFace(family.id, a1, person.id)
    await addFace(family.id, a1, person.id)
    await addFace(family.id, a2, person.id)
    await addFace(family.id, a2, person.id)

    const people = await listPeople(
      { familyId: family.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    const detail = await getPersonAssets(
      { familyId: family.id, personId: person.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(people).toHaveLength(1)
    expect(people[0]?.photoCount).toBe(2)
    expect(people[0]?.photoCount).toBe(detail.assets.length)
  })
})

describe('mergePeople', () => {
  it('moves all faces from source to target and deletes the source person', async () => {
    const { user } = await signup(
      { email: `t-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const a1 = await makeReadyAsset(family.id, user.id)
    const a2 = await makeReadyAsset(family.id, user.id)
    const a3 = await makeReadyAsset(family.id, user.id)
    const source = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    const target = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: '딸기' },
    })
    await addFace(family.id, a1, source.id)
    await addFace(family.id, a2, source.id)
    await addFace(family.id, a3, target.id)

    const { moved } = await mergePeople(
      { familyId: family.id, sourceId: source.id, targetId: target.id },
      db.prismaMedia,
    )
    expect(moved).toBe(2)

    // source 사람은 사라지고, target 이 3장 모두 보유.
    expect(await db.prismaMedia.person.findFirst({ where: { id: source.id } })).toBeNull()
    const detail = await getPersonAssets(
      { familyId: family.id, personId: target.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(detail.assets.map((a) => a.id).sort()).toEqual([a1, a2, a3].sort())
    // 얼굴이 풀려서(SetNull) 미배정으로 새지 않았는지 — 모두 target 에 붙어 있다.
    const orphan = await db.prismaMedia.face.count({
      where: { familyId: family.id, personId: null },
    })
    expect(orphan).toBe(0)
  })

  it('rejects merging a person into itself and cross-family merges', async () => {
    const { user } = await signup(
      { email: `t2-${Date.now()}@b.com`, password: 'password123', displayName: 'T' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const p = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    await expect(
      mergePeople({ familyId: family.id, sourceId: p.id, targetId: p.id }, db.prismaMedia),
    ).rejects.toThrow()
    await expect(
      mergePeople(
        { familyId: family.id, sourceId: p.id, targetId: crypto.randomUUID() },
        db.prismaMedia,
      ),
    ).rejects.toThrow()
  })
})

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
