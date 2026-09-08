import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listCooccurringPeople } from './cooccurrence'

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

async function addFace(familyId: string, assetId: string, personId: string, detScore = 0.9) {
  await db.prismaMedia.face.create({
    data: { familyId, assetId, personId, bboxX: 0.1, bboxY: 0.1, bboxW: 0.2, bboxH: 0.2, detScore },
  })
}

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${counter}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

describe('listCooccurringPeople', () => {
  it('reports the people sharing a photo, per photo and as a total', async () => {
    const { user, family } = await setup()
    const shared = await makeReadyAsset(family.id, user.id)
    const alone = await makeReadyAsset(family.id, user.id)
    const baby = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: '딸기' },
    })
    const unknown = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: null },
    })
    await addFace(family.id, shared, baby.id)
    await addFace(family.id, shared, unknown.id)
    await addFace(family.id, alone, unknown.id)

    const r = await listCooccurringPeople(
      { familyId: family.id, personId: unknown.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )

    expect(r.summary).toEqual([{ id: baby.id, name: '딸기', photoCount: 1, cover: null }])
    expect(r.byAsset[shared]).toEqual([{ id: baby.id, name: '딸기', photoCount: 1, cover: null }])
    expect(r.byAsset[alone]).toBeUndefined()
  })

  it('does not report the person as sharing a photo with themselves', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id)
    const person = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    await addFace(family.id, a, person.id)
    await addFace(family.id, a, person.id)

    const r = await listCooccurringPeople(
      { familyId: family.id, personId: person.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )
    expect(r.summary).toEqual([])
    expect(Object.keys(r.byAsset)).toEqual([])
  })

  it('counts each shared photo once and orders by how often they appear together', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id)
    const a2 = await makeReadyAsset(family.id, user.id)
    const me = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    const often = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: '엄마' },
    })
    const once = await db.prismaMedia.person.create({ data: { familyId: family.id, name: '아빠' } })
    for (const a of [a1, a2]) {
      await addFace(family.id, a, me.id)
      await addFace(family.id, a, often.id)
      await addFace(family.id, a, often.id) // detected twice in the same photo
    }
    await addFace(family.id, a1, once.id)

    const r = await listCooccurringPeople(
      { familyId: family.id, personId: me.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )
    expect(r.summary).toEqual([
      { id: often.id, name: '엄마', photoCount: 2, cover: null },
      { id: once.id, name: '아빠', photoCount: 1, cover: null },
    ])
    expect(r.byAsset[a1]?.map((p) => p.name)).toEqual(['엄마', '아빠'])
  })

  it('hides secret-story photos from the family role', async () => {
    const { user, family, baby } = await setup()
    const secretAsset = await makeReadyAsset(family.id, user.id)
    const me = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    const other = await db.prismaMedia.person.create({
      data: { familyId: family.id, name: '딸기' },
    })
    await addFace(family.id, secretAsset, me.id)
    await addFace(family.id, secretAsset, other.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        byUserId: user.id,
        entryDate: '2026-04-01',
        body: 'secret',
        assetIds: [secretAsset],
        visibility: 'guardians',
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const asFamily = await listCooccurringPeople(
      { familyId: family.id, personId: me.id, viewerRole: 'family' },
      db.prismaMedia,
      db.prismaPublic,
    )
    const asOwner = await listCooccurringPeople(
      { familyId: family.id, personId: me.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )
    expect(asFamily.summary).toEqual([])
    expect(asOwner.summary.map((p) => p.name)).toEqual(['딸기'])
  })

  it('ignores faces on deleted or unfinished photos', async () => {
    const { user, family } = await setup()
    const live = await makeReadyAsset(family.id, user.id)
    const gone = await makeReadyAsset(family.id, user.id)
    const me = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    const other = await db.prismaMedia.person.create({ data: { familyId: family.id, name: 'X' } })
    await addFace(family.id, live, me.id)
    await addFace(family.id, gone, me.id)
    await addFace(family.id, gone, other.id)
    await db.prismaMedia.asset.updateMany({
      where: { id: gone, familyId: family.id },
      data: { deletedAt: new Date() },
    })

    const r = await listCooccurringPeople(
      { familyId: family.id, personId: me.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )
    expect(r.summary).toEqual([])
  })
})

describe('listCooccurringPeople covers', () => {
  it('fills the face circle from the best-scoring live face when a media client is given', async () => {
    const { user, family } = await setup()
    const shared = await makeReadyAsset(family.id, user.id)
    const better = await makeReadyAsset(family.id, user.id)
    const me = await db.prismaMedia.person.create({ data: { familyId: family.id, name: null } })
    const other = await db.prismaMedia.person.create({ data: { familyId: family.id, name: 'X' } })
    await addFace(family.id, shared, me.id)
    await addFace(family.id, shared, other.id, 0.4)
    await addFace(family.id, better, other.id, 0.95)

    const r = await listCooccurringPeople(
      { familyId: family.id, personId: me.id, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(r.summary[0]?.cover?.assetId).toBe(better)
  })
})
