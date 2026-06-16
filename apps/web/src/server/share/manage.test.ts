import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createShareLink } from './create'
import { listAllShareLinks, revokeAllShareLinks } from './manage'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.shareLink.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0
async function makeReadyAsset(familyId: string, userId: string) {
  counter += 1
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date('2026-04-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset.id
}

async function setup() {
  const { user } = await signup(
    { username: 'owner', password: 'password123', displayName: 'Owner' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  return { user, family }
}

describe('share admin inventory', () => {
  it('lists all active links across targets with creator and kind, then bulk-revokes', async () => {
    const { user, family } = await setup()
    const assetId = await makeReadyAsset(family.id, user.id)
    const story = await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-01',
        body: 'b',
        assetIds: [assetId],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    await createShareLink(
      {
        target: { kind: 'asset', assetId },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createShareLink(
      {
        target: { kind: 'story', storyId: story.id },
        familyId: family.id,
        userId: user.id,
        ttl: '7d',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await createShareLink(
      {
        target: { kind: 'date', date: '2026-04-01' },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const links = await listAllShareLinks(family.id, db.prismaPublic)
    expect(links).toHaveLength(3)
    expect(new Set(links.map((l) => l.kind))).toEqual(new Set(['asset', 'story', 'date']))
    expect(links.every((l) => l.createdByName === 'Owner')).toBe(true)
    expect(links.find((l) => l.kind === 'date')?.target).toBe('2026-04-01')

    const revoked = await revokeAllShareLinks(family.id, db.prismaPublic)
    expect(revoked).toBe(3)
    expect(await listAllShareLinks(family.id, db.prismaPublic)).toHaveLength(0)
  })

  it('excludes expired links from the inventory', async () => {
    const { user, family } = await setup()
    const assetId = await makeReadyAsset(family.id, user.id)
    const live = await createShareLink(
      {
        target: { kind: 'asset', assetId },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const expiring = await createShareLink(
      { target: { kind: 'asset', assetId }, familyId: family.id, userId: user.id, ttl: '7d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.shareLink.update({
      where: { token: expiring.token },
      data: { expiresAt: new Date('2020-01-01') },
    })

    const links = await listAllShareLinks(family.id, db.prismaPublic)
    expect(links.map((l) => l.token)).toEqual([live.token])
  })

  it('scopes to the family — does not list or revoke another family links', async () => {
    const { user, family } = await setup()
    const assetId = await makeReadyAsset(family.id, user.id)
    await createShareLink(
      {
        target: { kind: 'asset', assetId },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    // 다른 가족 컨텍스트에서 회수 시도 → 0
    const other = await revokeAllShareLinks('00000000-0000-0000-0000-000000000000', db.prismaPublic)
    expect(other).toBe(0)
    expect(await listAllShareLinks(family.id, db.prismaPublic)).toHaveLength(1)
  })
})
