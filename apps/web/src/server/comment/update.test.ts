import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
import { updateComment } from './update'

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

describe('updateComment', () => {
  it('updates own comment body and sets editedAt', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateComment(
      { id: c.id, familyId: family.id, body: 'hello edited', byUserId: user.id },
      db.prismaPublic,
    )
    expect(updated.body).toBe('hello edited')
    expect(updated.editedAt).toBeInstanceOf(Date)
  })

  it('re-parses mentions on edit', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateComment(
      { id: c.id, familyId: family.id, body: 'hey @Bob', byUserId: user.id },
      db.prismaPublic,
    )
    expect(updated.mentionedUserIds).toContain(u2.id)
  })

  it('rejects editing another user comment', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: u2.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await expect(
      updateComment(
        { id: c.id, familyId: family.id, body: 'nope', byUserId: u2.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/본인|permission/)
  })

  it('rejects editing a soft-deleted comment', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.assetComment.update({
      where: { id: c.id },
      data: { deletedAt: new Date() },
    })
    await expect(
      updateComment(
        { id: c.id, familyId: family.id, body: 'try', byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/삭제/)
  })
})
