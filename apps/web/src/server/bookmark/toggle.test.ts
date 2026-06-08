import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { toggleBookmark } from './toggle'

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
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
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

describe('toggleBookmark', () => {
  it('adds when absent', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const result = await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(result.bookmarked).toBe(true)
  })

  it('removes when present', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const result = await toggleBookmark(
      { assetId: asset.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(result.bookmarked).toBe(false)
  })

  it('rejects foreign asset', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prismaPublic)
    const foreign = await makeReadyAsset(f2.id, u2.id, 'f1')
    await expect(
      toggleBookmark(
        { assetId: foreign.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/not found|asset/i)
  })

  it('family 역할은 비밀 스토리 자산을 북마크할 수 없다(거부)', async () => {
    const { user, family } = await setup()
    const { user: fam } = await signup(
      { email: `fam-${Date.now()}@b.com`, password: 'password123', displayName: 'Fam' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    const secret = await makeReadyAsset(family.id, user.id, 'secret')
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secret.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await expect(
      toggleBookmark(
        { assetId: secret.id, familyId: family.id, byUserId: fam.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/not found/i)
  })

  it('owner 는 비밀 스토리 자산을 북마크할 수 있다(게이트는 family 한정)', async () => {
    const { user, family } = await setup()
    const secret = await makeReadyAsset(family.id, user.id, 'secret')
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secret.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const result = await toggleBookmark(
      { assetId: secret.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(result.bookmarked).toBe(true)
  })

  it('family 역할은 비밀 아닌 자산을 북마크할 수 있다(게이트는 비밀 한정)', async () => {
    const { user, family } = await setup()
    const { user: fam } = await signup(
      { email: `fam2-${Date.now()}@b.com`, password: 'password123', displayName: 'Fam2' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    const normal = await makeReadyAsset(family.id, user.id, 'normal')
    const result = await toggleBookmark(
      { assetId: normal.id, familyId: family.id, byUserId: fam.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(result.bookmarked).toBe(true)
  })

  it('동시 토글에서 P2002 가 사용자에게 새지 않는다(멱등)', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'race')
    const input = { assetId: asset.id, familyId: family.id, byUserId: user.id }
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => toggleBookmark(input, db.prismaPublic, db.prismaMedia)),
    )
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    const count = await db.prismaPublic.assetBookmark.count({
      where: { assetId: asset.id, familyId: family.id },
    })
    expect(count).toBeLessThanOrEqual(1)
  })
})
