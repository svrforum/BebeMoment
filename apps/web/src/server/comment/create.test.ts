import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
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

  it('enqueues comment.created on success', async () => {
    const { user, family } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a1')
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})
    const c = await createComment(
      { assetId: asset.id, familyId: family.id, body: 'hi', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
      undefined,
      enqueue,
    )
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      familyId: family.id,
      actorUserId: user.id,
      type: 'comment.created',
      payload: { assetId: asset.id, commentId: c.id, mentionedUserIds: '[]' },
    })
  })

  it('멘션한 사용자 id 를 payload 에 싣는다', async () => {
    const { user, family } = await setup()
    const { user: bob } = await signup(
      { email: `bob-${Date.now()}@b.com`, password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: bob.id, role: 'family' },
    })
    const asset = await makeReadyAsset(family.id, user.id, 'm1')
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})
    await createComment(
      { assetId: asset.id, familyId: family.id, body: '@Bob 이것 좀 봐', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
      undefined,
      enqueue,
    )
    const job = enqueue.mock.calls[0]?.[0]
    expect(JSON.parse(job?.payload.mentionedUserIds ?? '[]')).toEqual([bob.id])
  })

  it('family 역할은 비밀 스토리 자산에 댓글을 달 수 없다(거부)', async () => {
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
      createComment(
        { assetId: secret.id, familyId: family.id, body: '몰래 댓글', byUserId: fam.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/not found/i)
  })

  it('owner 는 비밀 스토리 자산에 댓글을 달 수 있다(게이트는 family 한정)', async () => {
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
    const c = await createComment(
      { assetId: secret.id, familyId: family.id, body: 'owner 댓글', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(c.body).toBe('owner 댓글')
  })

  it('family 역할은 비밀 아닌 자산에 댓글을 달 수 있다(게이트는 비밀 한정)', async () => {
    const { user, family } = await setup()
    const { user: fam } = await signup(
      { email: `fam2-${Date.now()}@b.com`, password: 'password123', displayName: 'Fam2' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    const normal = await makeReadyAsset(family.id, user.id, 'normal')
    const c = await createComment(
      { assetId: normal.id, familyId: family.id, body: '평범 댓글', byUserId: fam.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(c.body).toBe('평범 댓글')
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
