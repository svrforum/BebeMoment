import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
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

describe('softDeleteComment', () => {
  it('author can delete own comment', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prisma,
    )
    await softDeleteComment(
      { id: c.id, familyId: family.id, byUserId: user.id },
      db.prisma,
    )
    const after = await db.prisma.assetComment.findUnique({ where: { id: c.id } })
    expect(after?.deletedAt).toBeInstanceOf(Date)
  })

  it('owner can delete another user comment', async () => {
    const { user: owner, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, owner.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: u2.id },
      db.prisma,
    )
    await softDeleteComment(
      { id: c.id, familyId: family.id, byUserId: owner.id },
      db.prisma,
    )
    const after = await db.prisma.assetComment.findUnique({ where: { id: c.id } })
    expect(after?.deletedAt).toBeInstanceOf(Date)
  })

  it('family role cannot delete another user comment', async () => {
    const { user: owner, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    const { user: u3 } = await signup(
      { email: 'u3@u3.com', password: 'password123', displayName: 'Carol' },
      db.prisma,
    )
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u3.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, owner.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: u2.id },
      db.prisma,
    )
    await expect(
      softDeleteComment(
        { id: c.id, familyId: family.id, byUserId: u3.id },
        db.prisma,
      ),
    ).rejects.toThrow(/permission/)
  })
})
