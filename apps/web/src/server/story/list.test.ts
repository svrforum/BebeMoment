import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createStoryEntry } from './create'
import { listStoryEntries } from './list'

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
  await db.prismaMedia.assetBaby.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
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
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

let assetCounter = 0
async function makeReadyAsset(familyId: string, userId: string) {
  assetCounter += 1
  const sha256 = assetCounter.toString(16).padStart(64, '0')
  const originalKey = `o-${assetCounter}`
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256,
      takenAt: new Date('2026-03-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset
}

describe('listStoryEntries', () => {
  it('returns entries in desc order by entryDate', async () => {
    const { user, family, baby } = await setup()
    const aA = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'A',
        assetIds: [aA.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aB = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-10',
        body: 'B',
        assetIds: [aB.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aC = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-05',
        body: 'C',
        assetIds: [aC.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const { items, nextCursor } = await listStoryEntries(
      family.id,
      {},
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items.map((e) => e.body)).toEqual(['B', 'C', 'A'])
    expect(nextCursor).toBeNull()
  })

  it('filters by babyId', async () => {
    const { user, family, baby } = await setup()
    const baby2 = await createBaby(
      { familyId: family.id, name: 'B2', birthDate: '2026-01-15', byUserId: user.id },
      db.prismaPublic,
    )
    const aB1 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'for-b1',
        assetIds: [aB1.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aB2 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby2.id,
        entryDate: '2026-04-02',
        body: 'for-b2',
        assetIds: [aB2.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const { items } = await listStoryEntries(
      family.id,
      { babyId: baby.id },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.body).toBe('for-b1')
  })

  it('filters by text (q) across title and body', async () => {
    const { user, family, baby } = await setup()
    const aQ1 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        title: '첫걸음',
        body: 'A',
        assetIds: [aQ1.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aQ2 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: '첫걸음을 떼었다',
        assetIds: [aQ2.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aQ3 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-03',
        body: '아무 말',
        assetIds: [aQ3.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const { items } = await listStoryEntries(
      family.id,
      { q: '첫걸음' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items).toHaveLength(2)
    // Pure text query — date-shaped strings no longer leak into entryDate.
    const { items: noisy } = await listStoryEntries(
      family.id,
      { q: '2026-04-01' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(noisy).toHaveLength(0)
  })

  it('filters by date (UTC day) via explicit date param', async () => {
    const { user, family, baby } = await setup()
    const aD1 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'on-1',
        assetIds: [aD1.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aD2 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: 'on-2',
        assetIds: [aD2.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const { items } = await listStoryEntries(
      family.id,
      { date: '2026-04-01' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items.map((e) => e.body)).toEqual(['on-1'])
  })

  it('combines q and date as AND', async () => {
    const { user, family, baby } = await setup()
    const aQD1 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '첫걸음',
        assetIds: [aQD1.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aQD2 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: '첫걸음',
        assetIds: [aQD2.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const aQD3 = await makeReadyAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'other',
        assetIds: [aQD3.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const { items } = await listStoryEntries(
      family.id,
      { q: '첫걸음', date: '2026-04-01' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items.map((e) => e.body)).toEqual(['첫걸음'])
  })

  it('hides secret-story photos from the family role even inside a family-visible story', async () => {
    const { user, family, baby } = await setup()
    const sharedAsset = await makeReadyAsset(family.id, user.id)
    const normalAsset = await makeReadyAsset(family.id, user.id)

    // family-visible story holding both the shared (also-secret) photo and a normal one
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'family',
        assetIds: [sharedAsset.id, normalAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    // guardians-only story that also contains the shared photo → Rule A: hidden from family everywhere
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [sharedAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const familyView = await listStoryEntries(
      family.id,
      { viewerRole: 'family' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    // family sees only the family-visible story, and its assets must exclude the secret-shared photo
    expect(familyView.items.map((e) => e.body)).toEqual(['family'])
    expect(familyView.items[0]?.assets.map((ea) => ea.assetId)).toEqual([normalAsset.id])

    const ownerView = await listStoryEntries(
      family.id,
      { viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    const ownerFamilyStory = ownerView.items.find((e) => e.body === 'family')
    expect(ownerFamilyStory?.assets.map((ea) => ea.assetId).sort()).toEqual(
      [sharedAsset.id, normalAsset.id].sort(),
    )
  })

  it('paginates via cursor', async () => {
    const { user, family, baby } = await setup()
    for (let i = 0; i < 5; i += 1) {
      const a = await makeReadyAsset(family.id, user.id)
      await createStoryEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: `2026-04-0${i + 1}`,
          body: `E${i}`,
          assetIds: [a.id],
          byUserId: user.id,
        },
        db.prismaPublic,
        db.prismaMedia,
      )
    }
    const media = new FakeMediaClient()
    const page1 = await listStoryEntries(
      family.id,
      { limit: 3 },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(page1.items).toHaveLength(3)
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await listStoryEntries(
      family.id,
      { limit: 3, cursor: page1.nextCursor as string },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(page2.items).toHaveLength(2)
    expect(page2.nextCursor).toBeNull()
    const combinedIds = [...page1.items, ...page2.items].map((e) => e.id)
    expect(new Set(combinedIds).size).toBe(5)
  })
})
