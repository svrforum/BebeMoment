import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listTimelineDays } from './days'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeAsset(
  familyId: string,
  userId: string,
  takenAt: string,
  sha: string,
  status: 'ready' | 'failed' | 'processing' = 'ready',
) {
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: sha.padEnd(64, '0'),
      takenAt: new Date(takenAt),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status } })
  return a
}

describe('listTimelineDays', () => {
  it('타임라인에 보이는 사진만 UTC 일자별로 세어 최신순으로 준다', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, '2026-09-13T23:30:00Z', 'a')
    await makeAsset(family.id, user.id, '2026-09-13T00:10:00Z', 'b')
    await makeAsset(family.id, user.id, '2026-09-10T12:00:00Z', 'c', 'failed')
    await makeAsset(family.id, user.id, '2026-09-11T12:00:00Z', 'd', 'processing')
    const gone = await makeAsset(family.id, user.id, '2026-09-12T12:00:00Z', 'e')
    await db.prismaMedia.asset.update({ where: { id: gone.id }, data: { deletedAt: new Date() } })
    const original = await makeAsset(family.id, user.id, '2026-09-09T12:00:00Z', 'f')
    const alias = await makeAsset(family.id, user.id, '2026-09-08T12:00:00Z', 'g')
    await db.prismaMedia.asset.update({
      where: { id: alias.id },
      data: { duplicateOf: original.id },
    })
    const other = await setup()
    await makeAsset(other.family.id, other.user.id, '2026-09-07T12:00:00Z', 'h')

    const days = await listTimelineDays(
      family.id,
      { sort: 'taken', viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(days).toEqual([
      { key: '2026-09-13', count: 2 },
      { key: '2026-09-10', count: 1 },
      { key: '2026-09-09', count: 1 },
    ])
  })

  it('비밀 스토리 사진은 family 에게서 빠진다', async () => {
    const { user, family } = await setup()
    const secret = await makeAsset(family.id, user.id, '2026-09-13T12:00:00Z', 's')
    await makeAsset(family.id, user.id, '2026-09-12T12:00:00Z', 'n')
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-09-13',
        body: 'b',
        assetIds: [secret.id],
        byUserId: user.id,
        visibility: 'guardians',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const asFamily = await listTimelineDays(
      family.id,
      { sort: 'taken', viewerRole: 'family' },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(asFamily.map((d) => d.key)).toEqual(['2026-09-12'])
    const asOwner = await listTimelineDays(
      family.id,
      { sort: 'taken', viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(asOwner.map((d) => d.key)).toEqual(['2026-09-13', '2026-09-12'])
  })

  it('업로드순은 createdAt 의 UTC 일자로 묶는다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id, '2020-01-01T00:00:00Z', 'x')
    await db.prismaMedia.asset.update({
      where: { id: a.id },
      data: { createdAt: new Date('2026-11-02T05:00:00Z') },
    })
    const days = await listTimelineDays(
      family.id,
      { sort: 'uploaded', viewerRole: 'owner' },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(days).toEqual([{ key: '2026-11-02', count: 1 }])
  })
})
