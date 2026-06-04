import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSetting } from '@/server/settings/set'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { attachAssetsToAlbum } from './attach-assets'
import { createAlbum } from './create'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.albumAsset.deleteMany()
  await db.prismaPublic.album.deleteMany()
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
  const album = await createAlbum(
    { familyId: family.id, byUserId: user.id, name: 'Trip' },
    db.prismaPublic,
  )
  return { user, family, album }
}

async function makeAsset(familyId: string, userId: string, sha: string) {
  return createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: sha.padEnd(64, '0'),
      takenAt: new Date(),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
}

describe('attachAssetsToAlbum notifications', () => {
  it('enqueues one album.asset_added per attach call on success', async () => {
    const { user, family, album } = await setup()
    const a1 = await makeAsset(family.id, user.id, 'a1')
    const a2 = await makeAsset(family.id, user.id, 'a2')
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})

    const result = await attachAssetsToAlbum(
      { albumId: album.id, familyId: family.id, byUserId: user.id, assetIds: [a1.id, a2.id] },
      db.prismaPublic,
      db.prismaMedia,
      enqueue,
    )

    expect(result.added).toBe(2)
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith({
      familyId: family.id,
      actorUserId: user.id,
      type: 'album.asset_added',
      payload: { albumId: album.id },
    })
  })

  it('family 역할은 비밀 앨범에 attach 할 수 없다(존재 비노출)', async () => {
    const { user, family, album } = await setup()
    await db.prismaPublic.album.update({ where: { id: album.id }, data: { secret: true } })
    // family 에게 album.asset.attach 부여(그래도 secret 가드에서 막혀야 한다).
    await setSetting('permissions.family', ['album.asset.attach'], null, db.prismaPublic)
    const { user: fam } = await signup(
      { username: `fam${Date.now()}`, password: 'password123', displayName: 'G' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    const a1 = await makeAsset(family.id, user.id, 'sx')
    await expect(
      attachAssetsToAlbum(
        { albumId: album.id, familyId: family.id, byUserId: fam.id, assetIds: [a1.id] },
        db.prismaPublic,
        db.prismaMedia,
        vi.fn(),
      ),
    ).rejects.toThrow('album.notFound')
  })

  it('does not enqueue when nothing is attached', async () => {
    const { user, family, album } = await setup()
    const enqueue = vi.fn<(job: NotificationJob) => Promise<void>>(async () => {})

    const result = await attachAssetsToAlbum(
      {
        albumId: album.id,
        familyId: family.id,
        byUserId: user.id,
        assetIds: [crypto.randomUUID()],
      },
      db.prismaPublic,
      db.prismaMedia,
      enqueue,
    )

    expect(result.added).toBe(0)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
