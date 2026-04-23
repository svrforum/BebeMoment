import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { listMyBookmarks } from './list-mine'
import { toggleBookmark } from './toggle'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.assetComment.deleteMany()
  await db.prisma.assetBookmark.deleteMany()
  await db.prisma.assetLike.deleteMany()
  await db.prisma.assetBaby.deleteMany()
  await db.prisma.asset.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    {
      email: `t-${Date.now()}-${Math.random()}@b.com`,
      password: 'password123',
      displayName: 'Alice',
    },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
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
    db.prisma,
  )
  await db.prisma.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('listMyBookmarks', () => {
  it('returns only my bookmarks, newest first', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, 'a1')
    const a2 = await makeReadyAsset(family.id, user.id, 'a2')
    await toggleBookmark(
      { assetId: a1.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    await new Promise((r) => setTimeout(r, 5))
    await toggleBookmark(
      { assetId: a2.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )

    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    await toggleBookmark(
      { assetId: a1.id, familyId: family.id, byUserId: u2.id },
      db.prisma,
    )

    const result = await listMyBookmarks(family.id, user.id, {}, db.prisma)
    expect(result.items.length).toBe(2)
    expect(result.items[0]!.asset.id).toBe(a2.id)
    expect(result.items[1]!.asset.id).toBe(a1.id)
  })

  it('paginates via cursor', async () => {
    const { user, family } = await setup()
    for (let i = 0; i < 5; i++) {
      const a = await makeReadyAsset(family.id, user.id, `a${i}`)
      await toggleBookmark(
        { assetId: a.id, familyId: family.id, byUserId: user.id },
        db.prisma,
      )
      await new Promise((r) => setTimeout(r, 2))
    }
    const p1 = await listMyBookmarks(family.id, user.id, { limit: 3 }, db.prisma)
    expect(p1.items.length).toBe(3)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = await listMyBookmarks(
      family.id,
      user.id,
      { limit: 3, cursor: p1.nextCursor! },
      db.prisma,
    )
    expect(p2.items.length).toBe(2)
    expect(p2.nextCursor).toBeNull()
  })
})
