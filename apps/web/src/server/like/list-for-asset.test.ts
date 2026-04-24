import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { likersForAsset } from './list-for-asset'
import { toggleLike } from './toggle'

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

describe('likersForAsset', () => {
  it('returns empty list when no likes', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const result = await likersForAsset(family.id, asset.id, db.prismaPublic)
    expect(result).toEqual({ count: 0, users: [] })
  })

  it('returns users who liked, sorted by createdAt', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    await toggleLike(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await toggleLike(
      { assetId: asset.id, familyId: family.id, byUserId: u2.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const result = await likersForAsset(family.id, asset.id, db.prismaPublic)
    expect(result.count).toBe(2)
    expect(result.users.map((u) => u.displayName)).toEqual(['Alice', 'Bob'])
  })
})
