import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
import { updateComment } from './update'

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

describe('updateComment', () => {
  it('updates own comment body and sets editedAt', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prisma,
    )
    const updated = await updateComment(
      { id: c.id, familyId: family.id, body: 'hello edited', byUserId: user.id },
      db.prisma,
    )
    expect(updated.body).toBe('hello edited')
    expect(updated.editedAt).toBeInstanceOf(Date)
  })

  it('re-parses mentions on edit', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prisma,
    )
    const updated = await updateComment(
      { id: c.id, familyId: family.id, body: 'hey @Bob', byUserId: user.id },
      db.prisma,
    )
    expect(updated.mentionedUserIds).toContain(u2.id)
  })

  it('rejects editing another user comment', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    await db.prisma.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prisma,
    )
    await expect(
      updateComment({ id: c.id, familyId: family.id, body: 'nope', byUserId: u2.id }, db.prisma),
    ).rejects.toThrow(/본인|permission/)
  })

  it('rejects editing a soft-deleted comment', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prisma,
    )
    await db.prisma.assetComment.update({
      where: { id: c.id },
      data: { deletedAt: new Date() },
    })
    await expect(
      updateComment({ id: c.id, familyId: family.id, body: 'try', byUserId: user.id }, db.prisma),
    ).rejects.toThrow(/삭제/)
  })
})
