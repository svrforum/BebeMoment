import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createStoryEntry } from './create'
import { softDeleteStoryEntry } from './soft-delete'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.assetBaby.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
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
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

async function makeReadyAsset(
  familyId: string,
  userId: string,
  sha256: string,
  originalKey: string,
) {
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256,
      takenAt: new Date('2026-03-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset
}

describe('softDeleteStoryEntry', () => {
  it('soft-deletes own entry', async () => {
    const { user, family, baby } = await setup()
    const asset = await makeReadyAsset(family.id, user.id, 'a'.repeat(64), 'o1')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [asset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteStoryEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const fresh = await db.prismaPublic.story.findUnique({ where: { id: entry.id } })
    expect(fresh?.deletedAt).not.toBeNull()
  })

  it('keeps photos by default but soft-deletes them when deleteAssets=true', async () => {
    const { user, family, baby } = await setup()
    const make = async (sha: string, key: string, date: string) => {
      const a = await makeReadyAsset(family.id, user.id, sha, key)
      const e = await createStoryEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: date,
          body: '본문',
          assetIds: [a.id],
          byUserId: user.id,
        },
        db.prismaPublic,
        db.prismaMedia,
      )
      return { a, e }
    }

    // 기본: 사진은 남는다.
    const kept = await make('b'.repeat(64), 'k1', '2026-04-02')
    await softDeleteStoryEntry(
      { id: kept.e.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const keptAsset = await db.prismaMedia.asset.findUnique({ where: { id: kept.a.id } })
    expect(keptAsset?.deletedAt).toBeNull()

    // deleteAssets=true: 사진도 휴지통으로.
    const gone = await make('c'.repeat(64), 'k2', '2026-04-03')
    await softDeleteStoryEntry(
      { id: gone.e.id, familyId: family.id, byUserId: user.id, deleteAssets: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    const goneAsset = await db.prismaMedia.asset.findUnique({ where: { id: gone.a.id } })
    expect(goneAsset?.deletedAt).not.toBeNull()
  })
})
