import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
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

describe('toggleBookmark', () => {
  it('adds when absent', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const result = await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    expect(result.bookmarked).toBe(true)
  })

  it('removes when present', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    const result = await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    expect(result.bookmarked).toBe(false)
  })

  it('rejects foreign asset', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prisma)
    const foreign = await makeReadyAsset(f2.id, u2.id, 'f1')
    await expect(
      toggleBookmark(
        { assetId: foreign.id, familyId: family.id, byUserId: user.id },
        db.prisma,
      ),
    ).rejects.toThrow(/not found|asset/i)
  })
})
