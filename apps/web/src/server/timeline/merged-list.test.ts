import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createStoryEntry } from '../story/create'
import { createFamily } from '../family/create'
import { listTimeline } from './merged-list'

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
  return { user, family }
}

async function makeAsset(familyId: string, userId: string, takenAt: Date, sha: string) {
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(1),
      sha256: sha.padEnd(64, '0'),
      takenAt,
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('listTimeline', () => {
  it('returns empty when no data', async () => {
    const { family } = await setup()
    const { items, nextCursor } = await listTimeline(
      family.id,
      {},
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(items).toEqual([])
    expect(nextCursor).toBeNull()
  })

  it('interleaves assets and diary by descending date', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, new Date('2026-04-10'), 'a1')
    await createStoryEntry(
      { familyId: family.id, babyId: null, entryDate: '2026-04-12', body: 'b', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await makeAsset(family.id, user.id, new Date('2026-04-15'), 'a2')
    const { items } = await listTimeline(
      family.id,
      { limit: 10 },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    const kinds = items.map((i) => i.kind)
    const dates = items.map((i) => i.ts.toISOString().slice(0, 10))
    expect(kinds).toEqual(['asset', 'story', 'asset'])
    expect(dates).toEqual(['2026-04-15', '2026-04-12', '2026-04-10'])
  })

  it('sort=uploaded orders by createdAt regardless of takenAt', async () => {
    const { user, family } = await setup()
    // Create assets out-of-order: the oldest takenAt is uploaded last.
    const a1 = await makeAsset(family.id, user.id, new Date('2026-04-15'), 'old-first')
    const a2 = await makeAsset(family.id, user.id, new Date('2026-04-10'), 'new-second')
    const a3 = await makeAsset(family.id, user.id, new Date('2026-04-20'), 'mid-third')
    const taken = await listTimeline(
      family.id,
      { limit: 10, sort: 'taken' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(taken.items.map((i) => i.id)).toEqual([a3.id, a1.id, a2.id])
    const uploaded = await listTimeline(
      family.id,
      { limit: 10, sort: 'uploaded' },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    // createdAt order = insertion order, so newest-uploaded first = a3, a2, a1.
    expect(uploaded.items.map((i) => i.id)).toEqual([a3.id, a2.id, a1.id])
  })

  it('supports cursor-based pagination', async () => {
    const { user, family } = await setup()
    for (let i = 0; i < 5; i++) {
      await makeAsset(family.id, user.id, new Date(`2026-04-${10 + i}`), `a${i}`)
    }
    const media = new FakeMediaClient()
    const p1 = await listTimeline(family.id, { limit: 3 }, db.prismaPublic, db.prismaMedia, media)
    expect(p1.items.length).toBe(3)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = await listTimeline(
      family.id,
      { limit: 3, cursor: p1.nextCursor as string },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(p2.items.length).toBe(2)
    expect(p2.nextCursor).toBeNull()
  })
})
