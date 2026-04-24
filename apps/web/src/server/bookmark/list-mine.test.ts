import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { listMyBookmarks } from './list-mine'
import { toggleBookmark } from './toggle'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.assetComment.deleteMany()
  await db.prismaPublic.assetBookmark.deleteMany()
  await db.prismaPublic.assetLike.deleteMany()
  await db.prismaMedia.assetBaby.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    {
      email: `t-${Date.now()}-${Math.random()}@b.com`,
      password: 'password123',
      displayName: 'Alice',
    },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeReadyAsset(familyId: string, userId: string, sha: string) {
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
      takenAt: new Date(),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('listMyBookmarks', () => {
  it('returns only my bookmarks, newest first', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, 'a1')
    const a2 = await makeReadyAsset(family.id, user.id, 'a2')
    await toggleBookmark(
      { assetId: a1.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await new Promise((r) => setTimeout(r, 5))
    await toggleBookmark(
      { assetId: a2.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )

    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    await toggleBookmark(
      { assetId: a1.id, familyId: family.id, byUserId: u2.id },
      db.prismaPublic,
      db.prismaMedia,
    )

    const result = await listMyBookmarks(
      family.id,
      user.id,
      {},
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(result.items.length).toBe(2)
    expect(result.items[0]!.asset?.id).toBe(a2.id)
    expect(result.items[1]!.asset?.id).toBe(a1.id)
  })

  it('paginates via cursor', async () => {
    const { user, family } = await setup()
    for (let i = 0; i < 5; i++) {
      const a = await makeReadyAsset(family.id, user.id, `a${i}`)
      await toggleBookmark(
        { assetId: a.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      )
      await new Promise((r) => setTimeout(r, 2))
    }
    const media = new FakeMediaClient()
    const p1 = await listMyBookmarks(
      family.id,
      user.id,
      { limit: 3 },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(p1.items.length).toBe(3)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = await listMyBookmarks(
      family.id,
      user.id,
      { limit: 3, cursor: p1.nextCursor! },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(p2.items.length).toBe(2)
    expect(p2.nextCursor).toBeNull()
  })
})
