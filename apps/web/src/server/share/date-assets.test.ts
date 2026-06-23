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
async function makeReadyAsset(familyId: string, userId: string) {
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
      takenAt: new Date('2026-04-01T08:00:00.000Z'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset
}

describe('getDateAssetIds with createdBefore', () => {
  it('excludes assets uploaded after the share link was created', async () => {
    const { user } = await signup(
      { username: 'owner', password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const early = await makeReadyAsset(family.id, user.id)
    const late = await makeReadyAsset(family.id, user.id)
    // force a later createdAt on the "late" asset
    const cutoff = new Date('2026-05-01T00:00:00.000Z')
    await db.prismaMedia.asset.update({
      where: { id: early.id },
      data: { createdAt: new Date('2026-04-10T00:00:00.000Z') },
    })
    await db.prismaMedia.asset.update({
      where: { id: late.id },
      data: { createdAt: new Date('2026-05-10T00:00:00.000Z') },
    })

    const frozen = await getDateAssetIds('2026-04-01', family.id, db.prismaMedia, cutoff)
    expect(frozen).toEqual([early.id])

    const live = await getDateAssetIds('2026-04-01', family.id, db.prismaMedia)
    expect(live.sort()).toEqual([early.id, late.id].sort())
  })
})
