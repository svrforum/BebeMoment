import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAsset } from './create'
import { resolveAssetUrlsForViewer } from './urls-for-viewer'

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
  await db.prismaMedia.assetBaby.deleteMany()
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
async function makeAsset(familyId: string, userId: string, sha: string) {
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
      takenAt: new Date('2026-04-10'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('resolveAssetUrlsForViewer', () => {
  it('excludes secret-story assets when the viewer is family', async () => {
    const { user, family } = await setup()
    const secret = await makeAsset(family.id, user.id, 'sec')
    const normal = await makeAsset(family.id, user.id, 'norm')
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-10',
        body: 'b',
        assetIds: [secret.id],
        byUserId: user.id,
        visibility: 'guardians',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const media = new FakeMediaClient()
    await resolveAssetUrlsForViewer(
      { familyId: family.id, viewerRole: 'family', ids: [secret.id, normal.id] },
      db.prismaPublic,
      media,
    )
    expect(media.calls.getAssetUrlsBatch).toHaveLength(1)
    expect(media.calls.getAssetUrlsBatch[0]?.assetIds).toEqual([normal.id])
  })

  it('returns all requested assets when the viewer is owner', async () => {
    const { user, family } = await setup()
    const secret = await makeAsset(family.id, user.id, 'sec')
    const normal = await makeAsset(family.id, user.id, 'norm')
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-10',
        body: 'b',
        assetIds: [secret.id],
        byUserId: user.id,
        visibility: 'guardians',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const media = new FakeMediaClient()
    await resolveAssetUrlsForViewer(
      { familyId: family.id, viewerRole: 'owner', ids: [secret.id, normal.id] },
      db.prismaPublic,
      media,
    )
    expect(media.calls.getAssetUrlsBatch[0]?.assetIds).toEqual([secret.id, normal.id])
  })
})
