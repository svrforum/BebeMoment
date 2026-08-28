import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listWidgetPhotos, setWidgetPhotoOrder, toggleWidgetPhoto } from './collection'
import { getWidgetConfig } from './config'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.widgetPhoto.deleteMany()
  await db.prismaPublic.widgetToken.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let seq = 0
async function setup(name = 'F') {
  const { user } = await signup(
    { username: `wc${seq++}${Date.now()}`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name, userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeAsset(familyId: string, userId: string) {
  const sha = `c${seq++}`.padEnd(64, '0')
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(1),
      sha256: sha,
      takenAt: new Date('2026-06-01T00:00:00Z'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('toggleWidgetPhoto', () => {
  it('담고 다시 누르면 빠진다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)

    const on = await toggleWidgetPhoto(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(on.inWidget).toBe(true)

    const off = await toggleWidgetPhoto(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(off.inWidget).toBe(false)
    expect(
      await listWidgetPhotos({ familyId: family.id, userId: user.id }, db.prismaPublic),
    ).toEqual([])
  })

  it('첫 사진을 담으면 위젯 소스가 collection 으로 자동 전환된다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)
    expect((await getWidgetConfig(user.id, db.prismaPublic)).source).toBe('recent')

    await toggleWidgetPhoto(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect((await getWidgetConfig(user.id, db.prismaPublic)).source).toBe('collection')
  })

  it('이미 담긴 사진이 있으면 사용자가 고른 소스를 건드리지 않는다', async () => {
    const { user, family } = await setup()
    const a1 = await makeAsset(family.id, user.id)
    const a2 = await makeAsset(family.id, user.id)
    await toggleWidgetPhoto(
      { assetId: a1.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.widgetToken.update({
      where: { userId: user.id },
      data: { widgetSource: 'recent' },
    })

    await toggleWidgetPhoto(
      { assetId: a2.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect((await getWidgetConfig(user.id, db.prismaPublic)).source).toBe('recent')
  })

  it('다른 가족의 사진은 담을 수 없다', async () => {
    const { user, family } = await setup('A')
    const other = await setup('B')
    const foreign = await makeAsset(other.family.id, other.user.id)

    await expect(
      toggleWidgetPhoto(
        { assetId: foreign.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.notFound')
  })

  it('family 역할에게 숨겨진 비밀 스토리 사진은 담을 수 없다', async () => {
    const { user, family } = await setup()
    const { user: fam } = await signup(
      { username: `fm${seq++}${Date.now()}`, password: 'password123', displayName: 'Fam' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: fam.id, role: 'family' },
    })
    const secret = await makeAsset(family.id, user.id)
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-06-05',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secret.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    await expect(
      toggleWidgetPhoto(
        { assetId: secret.id, familyId: family.id, byUserId: fam.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.notFound')
    // owner 는 담을 수 있다
    const ok = await toggleWidgetPhoto(
      { assetId: secret.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(ok.inWidget).toBe(true)
  })

  it('담은 순서대로 sortOrder 가 이어진다', async () => {
    const { user, family } = await setup()
    const a1 = await makeAsset(family.id, user.id)
    const a2 = await makeAsset(family.id, user.id)
    for (const a of [a1, a2]) {
      await toggleWidgetPhoto(
        { assetId: a.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      )
    }
    const list = await listWidgetPhotos({ familyId: family.id, userId: user.id }, db.prismaPublic)
    expect(list).toEqual([a1.id, a2.id])
  })
})

describe('setWidgetPhotoOrder', () => {
  it('넘긴 순서로 재정렬하고 목록에 없는 id 는 무시한다', async () => {
    const { user, family } = await setup()
    const a1 = await makeAsset(family.id, user.id)
    const a2 = await makeAsset(family.id, user.id)
    const a3 = await makeAsset(family.id, user.id)
    for (const a of [a1, a2, a3]) {
      await toggleWidgetPhoto(
        { assetId: a.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
        db.prismaMedia,
      )
    }

    await setWidgetPhotoOrder(
      { familyId: family.id, userId: user.id, assetIds: [a3.id, a1.id, a2.id, a1.id] },
      db.prismaPublic,
    )
    expect(
      await listWidgetPhotos({ familyId: family.id, userId: user.id }, db.prismaPublic),
    ).toEqual([a3.id, a1.id, a2.id])
  })
})
