import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createComment } from './create'

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

describe('createComment', () => {
  it('creates with empty mentions (plain body)', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hello world', byUserId: user.id },
      db.prisma,
    )
    expect(c.body).toBe('hello world')
    expect(c.mentionedUserIds).toEqual([])
    expect(c.authorUserId).toBe(user.id)
  })

  it('parses @name mention referring to family member', async () => {
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
      { assetId: asset.id, familyId: family.id, body: 'hey @Bob check this', byUserId: user.id },
      db.prisma,
    )
    expect(c.mentionedUserIds).toContain(u2.id)
  })

  it('rejects empty body', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await expect(
      createComment(
        { assetId: asset.id, familyId: family.id, body: '', byUserId: user.id },
        db.prisma,
      ),
    ).rejects.toThrow()
  })

  it('rejects body over 2000 chars', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await expect(
      createComment(
        { assetId: asset.id, familyId: family.id, body: 'x'.repeat(2001), byUserId: user.id },
        db.prisma,
      ),
    ).rejects.toThrow()
  })

  it('rejects asset from another family', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prisma,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prisma)
    const foreign = await makeReadyAsset(f2.id, u2.id, 'f1')
    await expect(
      createComment(
        { assetId: foreign.id, familyId: family.id, body: 'hello', byUserId: user.id },
        db.prisma,
      ),
    ).rejects.toThrow(/not found|asset/i)
  })
})
