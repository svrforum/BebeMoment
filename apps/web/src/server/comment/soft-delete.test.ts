import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
import { softDeleteComment } from './soft-delete'

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

describe('softDeleteComment', () => {
  it('author can delete own comment', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteComment(
      { id: c.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const after = await db.prismaPublic.assetComment.findUnique({ where: { id: c.id } })
    expect(after?.deletedAt).toBeInstanceOf(Date)
  })

  it('owner can delete another user comment', async () => {
    const { user: owner, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, owner.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: u2.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteComment(
      { id: c.id, familyId: family.id, byUserId: owner.id },
      db.prismaPublic,
    )
    const after = await db.prismaPublic.assetComment.findUnique({ where: { id: c.id } })
    expect(after?.deletedAt).toBeInstanceOf(Date)
  })

  it('family role cannot delete another user comment', async () => {
    const { user: owner, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    const { user: u3 } = await signup(
      { email: 'u3@u3.com', password: 'password123', displayName: 'Carol' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u3.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, owner.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: u2.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await expect(
      softDeleteComment(
        { id: c.id, familyId: family.id, byUserId: u3.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission/)
  })
})
