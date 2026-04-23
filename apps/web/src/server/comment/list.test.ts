import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
import { listComments } from './list'
import { softDeleteComment } from './soft-delete'

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

describe('listComments', () => {
  it('returns comments in ASC createdAt, including deleted', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c1 = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'first', byUserId: user.id },
      db.prisma,
    )
    // Ensure distinct createdAt ordering
    await new Promise((r) => setTimeout(r, 5))
    const c2 = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'second', byUserId: user.id },
      db.prisma,
    )
    await softDeleteComment(
      { id: c1.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )

    const items = await listComments(family.id, asset.id, db.prisma)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe(c1.id)
    expect(items[1].id).toBe(c2.id)
    expect(items[0].deletedAt).toBeInstanceOf(Date)
    expect(items[0].author).toBeDefined()
    expect(items[0].author.displayName).toBe('Alice')
  })

  it('returns empty array when no comments', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const items = await listComments(family.id, asset.id, db.prisma)
    expect(items).toEqual([])
  })
})
