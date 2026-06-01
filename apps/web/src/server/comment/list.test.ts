import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'
import { listComments } from './list'
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

describe('listComments', () => {
  it('returns comments in ASC createdAt, including deleted', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c1 = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'first', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    // Ensure distinct createdAt ordering
    await new Promise((r) => setTimeout(r, 5))
    const c2 = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'second', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteComment({ id: c1.id, familyId: family.id, byUserId: user.id }, db.prismaPublic)

    const items = await listComments(family.id, asset.id, db.prismaPublic)
    expect(items).toHaveLength(2)
    const first = items[0]
    const second = items[1]
    if (!first || !second) throw new Error('expected two items')
    expect(first.id).toBe(c1.id)
    expect(second.id).toBe(c2.id)
    expect(first.deletedAt).toBeInstanceOf(Date)
    expect(first.author).toBeDefined()
    expect(first.author.displayName).toBe('Alice')
  })

  it('returns empty array when no comments', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const items = await listComments(family.id, asset.id, db.prismaPublic)
    expect(items).toEqual([])
  })

  it('삭제된 댓글은 본문·멘션을 비워서 반환한다(tombstone 만)', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: '비밀 내용', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteComment({ id: c.id, familyId: family.id, byUserId: user.id }, db.prismaPublic)

    const items = await listComments(family.id, asset.id, db.prismaPublic)
    expect(items).toHaveLength(1)
    expect(items[0]?.deletedAt).not.toBeNull()
    expect(items[0]?.body).toBe('')
    expect(items[0]?.mentionedUserIds).toEqual([])
  })
})
