import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { loadCalendarMonth } from './month'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
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

async function makeReady(familyId: string, userId: string, sha: string, takenAt: Date) {
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
      takenAt,
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: a.id, familyId, status: 'ready' }, db.prismaMedia)
  return a.id
}

describe('loadCalendarMonth', () => {
  it('해당 달 사진만 조달하고 다른 달은 제외한다(전역 캡 없음)', async () => {
    const { user, family } = await setup()
    const mayId = await makeReady(family.id, user.id, 'may', new Date('2026-05-10T12:00:00Z'))
    await makeReady(family.id, user.id, 'apr', new Date('2026-04-10T12:00:00Z'))
    await makeReady(family.id, user.id, 'jun', new Date('2026-06-10T12:00:00Z'))

    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner' }, // month 4 = May (0-based)
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data.assets.map((a) => a.id)).toEqual([mayId])
  })

  it('하루 여러 장이면 커버 1장만 URL 사인한다', async () => {
    const { user, family } = await setup()
    await makeReady(family.id, user.id, 'd1a', new Date('2026-05-10T09:00:00Z'))
    await makeReady(family.id, user.id, 'd1b', new Date('2026-05-10T18:00:00Z'))
    const media = new FakeMediaClient()
    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      media,
    )
    // 두 자산 모두 목록엔 있지만 signed URL batch 는 커버(1장)만
    expect(data.assets).toHaveLength(2)
    expect(media.calls.getAssetUrlsBatch[0]?.assetIds).toHaveLength(1)
  })
})
