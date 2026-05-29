import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

describe('listStoryEntries', () => {
  it('returns entries in desc order by entryDate', async () => {
    const { user, family, baby } = await setup()
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'A',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-10',
        body: 'B',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-05',
        body: 'C',
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
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'for-b1',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby2.id,
        entryDate: '2026-04-02',
        body: 'for-b2',
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
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        title: '첫걸음',
        body: 'A',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: '첫걸음을 떼었다',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-03',
        body: '아무 말',
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
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'on-1',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: 'on-2',
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
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '첫걸음',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-02',
        body: '첫걸음',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'other',
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

  it('paginates via cursor', async () => {
    const { user, family, baby } = await setup()
    for (let i = 0; i < 5; i += 1) {
      await createStoryEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: `2026-04-0${i + 1}`,
          body: `E${i}`,
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
