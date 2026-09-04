import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { getDateAssetIds } from './date-assets'

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

let counter = 0
async function makeReadyAsset(familyId: string, userId: string, takenAt: string) {
  counter += 1
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `o-${counter}`,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date(takenAt),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset
}

describe('getDateAssetIds', () => {
  it("returns the day's ready photos oldest first, no matter when they were uploaded", async () => {
    const { user } = await signup(
      { username: 'owner', password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const later = await makeReadyAsset(family.id, user.id, '2026-04-01T10:00:00.000Z')
    const earlier = await makeReadyAsset(family.id, user.id, '2026-04-01T08:00:00.000Z')
    await makeReadyAsset(family.id, user.id, '2026-04-02T00:00:00.000Z')
    // 링크 발급 뒤에 올라온 사진도 포함된다(날짜 공유는 동적).
    await db.prismaMedia.asset.update({
      where: { id: later.id, familyId: family.id },
      data: { createdAt: new Date('2027-01-01T00:00:00.000Z') },
    })

    const ids = await getDateAssetIds('2026-04-01', family.id, db.prismaMedia)
    expect(ids).toEqual([earlier.id, later.id])
  })
})
