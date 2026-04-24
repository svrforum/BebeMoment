import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'

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

describe('createComment', () => {
  it('creates with empty mentions (plain body)', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello world', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(c.body).toBe('hello world')
    expect(c.mentionedUserIds).toEqual([])
    expect(c.authorUserId).toBe(user.id)
  })

  it('parses @name mention referring to family member', async () => {
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
      { assetId: asset.id, familyId: family.id, body: 'hey @Bob check this', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(c.mentionedUserIds).toContain(u2.id)
  })

  it('rejects empty body', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await expect(
      createComment(
        { assetId: asset.id, familyId: family.id, body: '', byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow()
  })

  it('rejects body over 2000 chars', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await expect(
      createComment(
        { assetId: asset.id, familyId: family.id, body: 'x'.repeat(2001), byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow()
  })

  it('rejects asset from another family', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prismaPublic)
    const foreign = await makeReadyAsset(f2.id, u2.id, 'f1')
    await expect(
      createComment(
        { assetId: foreign.id, familyId: family.id, body: 'hello', byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/not found|asset/i)
  })
})
