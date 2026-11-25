import { randomUUID } from 'node:crypto'
import { setSetting } from '@/server/settings/set'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { attachAssetsToAlbum } from './attach-assets'
import { attachEntriesToAlbum } from './attach-entries'
import { createAlbum } from './create'
import { deleteAlbum } from './delete'
import { detachAssetFromAlbum } from './detach-asset'
import { detachEntryFromAlbum } from './detach-entry'
import { moveAlbum } from './move'
import { updateAlbum } from './update'

// family 역할은 비밀 앨범(과 그 아래 앨범)을 어떤 읽기로도 못 본다. 쓰기도 같아야 한다 — UUID 를
// 알아낸 family 가 그 앨범을 고치거나 비울 수 있으면 안 되고, 응답이 '없는 앨범' 과 달라도
// 숨긴 앨범이 거기 있다는 사실이 드러난다.

const FAMILY_ALBUM_CAPS = [
  'album.create',
  'album.update.own',
  'album.delete.own',
  'album.asset.attach',
  'album.asset.detach',
]

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.albumStory.deleteMany()
  await db.prismaPublic.albumAsset.deleteMany()
  await db.prismaPublic.album.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0

/**
 * 보호자가 만든 비밀 앨범 `hidden`, 그리고 family 멤버가 직접 만들었지만 나중에 부모가 비밀이
 * 되어 숨겨진 `famChild`(자기 앨범이라 update.own·delete.own 이 성립한다). 둘 다 같은 사진 한
 * 장과 가족 공개 스토리 하나를 담고 있다.
 */
async function setup(familyCaps: string[] = FAMILY_ALBUM_CAPS) {
  counter += 1
  const p = db.prismaPublic
  const { user: owner } = await signup(
    { email: `album-w-${counter}@b.com`, password: 'password123', displayName: 'O' },
    p,
  )
  const { family } = await createFamily({ name: 'F', userId: owner.id }, p)
  const { user: fam } = await signup(
    { email: `album-wf-${counter}@b.com`, password: 'password123', displayName: 'G' },
    p,
  )
  await p.membership.create({ data: { familyId: family.id, userId: fam.id, role: 'family' } })
  await setSetting('permissions.family', familyCaps, null, p)

  const hidden = await createAlbum(
    { familyId: family.id, byUserId: owner.id, name: 'Hidden', secret: true },
    p,
  )
  const shelf = await createAlbum({ familyId: family.id, byUserId: owner.id, name: 'Shelf' }, p)
  const famChild = await createAlbum(
    { familyId: family.id, byUserId: fam.id, name: 'Mine', parentId: shelf.id },
    p,
  )
  await p.album.update({ where: { id: shelf.id }, data: { secret: true } })

  const asset = await createAsset(
    {
      familyId: family.id,
      uploadedByUserId: owner.id,
      kind: 'image',
      originalKey: `k-w-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: `w${counter}`.padEnd(64, '0'),
      takenAt: new Date('2026-04-01'),
      takenAtSource: 'uploaded',
    },
    p,
    db.prismaMedia,
  )
  await updateAssetStatus(
    { assetId: asset.id, familyId: family.id, status: 'ready' },
    db.prismaMedia,
  )
  const story = await p.story.create({
    data: {
      familyId: family.id,
      entryDate: new Date('2026-04-01'),
      body: 'b',
      createdByUserId: owner.id,
    },
  })
  for (const albumId of [hidden.id, famChild.id]) {
    await p.albumAsset.create({
      data: { albumId, familyId: family.id, assetId: asset.id, addedByUserId: owner.id },
    })
    await p.albumStory.create({
      data: { albumId, familyId: family.id, storyId: story.id, addedByUserId: owner.id },
    })
  }
  return { familyId: family.id, owner, fam, hidden, shelf, famChild, asset, story }
}

type Setup = Awaited<ReturnType<typeof setup>>
const linkCounts = async (s: Setup, albumId: string) => ({
  assets: await db.prismaPublic.albumAsset.count({ where: { albumId, familyId: s.familyId } }),
  stories: await db.prismaPublic.albumStory.count({ where: { albumId, familyId: s.familyId } }),
})

describe('family 역할의 비밀 앨범 쓰기는 없는 앨범과 똑같이 거절된다', () => {
  it('사진 빼기', async () => {
    const s = await setup()
    const detach = (albumId: string) =>
      detachAssetFromAlbum(
        { albumId, assetId: s.asset.id, familyId: s.familyId, byUserId: s.fam.id },
        db.prismaPublic,
      )
    for (const albumId of [s.hidden.id, s.famChild.id, randomUUID()]) {
      await expect(detach(albumId)).rejects.toThrow('album.notFound')
    }
    expect(await linkCounts(s, s.hidden.id)).toEqual({ assets: 1, stories: 1 })
    expect(await linkCounts(s, s.famChild.id)).toEqual({ assets: 1, stories: 1 })
  })

  it('스토리 빼기', async () => {
    const s = await setup()
    const detach = (albumId: string) =>
      detachEntryFromAlbum(
        { albumId, storyId: s.story.id, familyId: s.familyId, byUserId: s.fam.id },
        db.prismaPublic,
      )
    for (const albumId of [s.hidden.id, s.famChild.id, randomUUID()]) {
      await expect(detach(albumId)).rejects.toThrow('album.notFound')
    }
    expect(await linkCounts(s, s.famChild.id)).toEqual({ assets: 1, stories: 1 })
  })

  it('이름 바꾸기 — 자기가 만든 앨범이라도 비밀 조상 아래면', async () => {
    const s = await setup()
    await expect(
      updateAlbum(
        { albumId: s.famChild.id, familyId: s.familyId, byUserId: s.fam.id, name: 'Renamed' },
        db.prismaPublic,
      ),
    ).rejects.toThrow('album.notFound')
    const row = await db.prismaPublic.album.findFirst({ where: { id: s.famChild.id } })
    expect(row?.name).toBe('Mine')
  })

  it('지우기 — 자기가 만든 앨범이라도 비밀 조상 아래면', async () => {
    const s = await setup()
    await expect(
      deleteAlbum(
        { albumId: s.famChild.id, familyId: s.familyId, byUserId: s.fam.id, cascade: true },
        db.prismaPublic,
      ),
    ).rejects.toThrow('album.notFound')
    const row = await db.prismaPublic.album.findFirst({ where: { id: s.famChild.id } })
    expect(row?.deletedAt).toBeNull()
  })

  it('비밀 앨범 아래에 새 앨범 만들기', async () => {
    const s = await setup()
    for (const parentId of [s.hidden.id, s.famChild.id, randomUUID()]) {
      await expect(
        createAlbum(
          { familyId: s.familyId, byUserId: s.fam.id, name: 'New', parentId },
          db.prismaPublic,
        ),
      ).rejects.toThrow('album.parentNotFound')
    }
  })

  it('비밀 앨범 아래로 옮기기', async () => {
    const s = await setup()
    const mine = await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Open mine' },
      db.prismaPublic,
    )
    for (const newParentId of [s.hidden.id, s.famChild.id, randomUUID()]) {
      await expect(
        moveAlbum(
          { albumId: mine.id, familyId: s.familyId, byUserId: s.fam.id, newParentId },
          db.prismaPublic,
        ),
      ).rejects.toThrow('album.moveTargetNotFound')
    }
  })

  it('담기 권한이 없어도 비밀 앨범과 없는 앨범의 응답이 같다', async () => {
    const s = await setup(['album.create'])
    for (const albumId of [s.hidden.id, randomUUID()]) {
      await expect(
        attachAssetsToAlbum(
          { albumId, familyId: s.familyId, byUserId: s.fam.id, assetIds: [s.asset.id] },
          db.prismaPublic,
          db.prismaMedia,
          async () => {},
        ),
      ).rejects.toThrow('album.permissionDenied')
      await expect(
        attachEntriesToAlbum(
          { albumId, familyId: s.familyId, byUserId: s.fam.id, entryIds: [s.story.id] },
          db.prismaPublic,
        ),
      ).rejects.toThrow('album.permissionDenied')
    }
  })
})

describe('비밀 스토리 사진 수', () => {
  it('담은 뒤 돌려주는 사진 수는 family 에겐 비밀 스토리 사진을 뺀 수다', async () => {
    const s = await setup()
    const mine = await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Open mine' },
      db.prismaPublic,
    )
    await db.prismaPublic.story.update({
      where: { id: s.story.id },
      data: { visibility: 'guardians', assets: { create: [{ assetId: s.asset.id, order: 0 }] } },
    })
    await db.prismaPublic.albumAsset.create({
      data: {
        albumId: mine.id,
        familyId: s.familyId,
        assetId: s.asset.id,
        addedByUserId: s.owner.id,
      },
    })
    const visible = await db.prismaMedia.asset.create({
      data: {
        familyId: s.familyId,
        uploadedByUserId: s.fam.id,
        kind: 'image',
        originalKey: `k-v-${counter}`,
        originalFilename: 'v.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: `v${counter}`.padEnd(64, '0'),
        takenAt: new Date('2026-04-02'),
        takenAtSource: 'uploaded',
        status: 'ready',
      },
    })
    const attach = (byUserId: string) =>
      attachAssetsToAlbum(
        { albumId: mine.id, familyId: s.familyId, byUserId, assetIds: [visible.id] },
        db.prismaPublic,
        db.prismaMedia,
        async () => {},
      )
    expect(await attach(s.fam.id)).toEqual({ added: 1, total: 1 })
    expect(await attach(s.owner.id)).toEqual({ added: 0, total: 2 })
  })
})

describe('지우기 cascade', () => {
  // family 가 자기 앨범을 통째로 지우면 그 아래 보호자가 숨겨 둔 비밀 앨범까지 함께 지워진다 —
  // 볼 수도 없는 앨범을 지우게 두지 않는다. 개수 안내(409)도 숨긴 앨범을 세어 버린다.
  it('family 는 아래에 비밀 앨범이 있는 자기 앨범을 지울 수 없다', async () => {
    const s = await setup()
    const mine = await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Open mine' },
      db.prismaPublic,
    )
    const secretChild = await createAlbum(
      {
        familyId: s.familyId,
        byUserId: s.owner.id,
        name: 'Kept',
        parentId: mine.id,
        secret: true,
      },
      db.prismaPublic,
    )
    for (const cascade of [false, true]) {
      await expect(
        deleteAlbum(
          { albumId: mine.id, familyId: s.familyId, byUserId: s.fam.id, cascade },
          db.prismaPublic,
        ),
      ).rejects.toThrow('album.deleteDenied')
    }
    const rows = await db.prismaPublic.album.findMany({
      where: { id: { in: [mine.id, secretChild.id] }, deletedAt: null },
    })
    expect(rows).toHaveLength(2)
  })

  // 담긴 사진이 전부 비밀 스토리 사진이면 family 화면엔 빈 앨범이다. 서버가 그 사진까지 세어
  // "사진 1장이 있어요" 로 막으면 거절 문구가 비밀 사진 수를 알려 준다.
  it('family 에겐 비밀 스토리 사진을 세지 않는다 — 빈 앨범처럼 지워진다', async () => {
    const s = await setup()
    const mine = await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Open mine' },
      db.prismaPublic,
    )
    await db.prismaPublic.story.update({
      where: { id: s.story.id },
      data: { visibility: 'guardians', assets: { create: [{ assetId: s.asset.id, order: 0 }] } },
    })
    await db.prismaPublic.albumAsset.create({
      data: {
        albumId: mine.id,
        familyId: s.familyId,
        assetId: s.asset.id,
        addedByUserId: s.owner.id,
      },
    })
    expect(
      await deleteAlbum(
        { albumId: mine.id, familyId: s.familyId, byUserId: s.fam.id },
        db.prismaPublic,
      ),
    ).toEqual({ removedAlbums: 1, removedAttachments: 0 })
  })

  it('비밀 앨범이 없으면 family 도 자기 앨범을 하위째 지운다', async () => {
    const s = await setup()
    const mine = await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Open mine' },
      db.prismaPublic,
    )
    await createAlbum(
      { familyId: s.familyId, byUserId: s.fam.id, name: 'Sub', parentId: mine.id },
      db.prismaPublic,
    )
    expect(
      await deleteAlbum(
        { albumId: mine.id, familyId: s.familyId, byUserId: s.fam.id, cascade: true },
        db.prismaPublic,
      ),
    ).toEqual({ removedAlbums: 2, removedAttachments: 0 })
  })
})

describe('보호자는 비밀 앨범도 그대로 고친다', () => {
  it('사진·스토리 빼기, 이름 바꾸기, 하위째 지우기', async () => {
    const s = await setup()
    const by = { familyId: s.familyId, byUserId: s.owner.id }
    expect(
      await detachAssetFromAlbum(
        { ...by, albumId: s.famChild.id, assetId: s.asset.id },
        db.prismaPublic,
      ),
    ).toEqual({ ok: true })
    expect(
      await detachEntryFromAlbum(
        { ...by, albumId: s.famChild.id, storyId: s.story.id },
        db.prismaPublic,
      ),
    ).toEqual({ ok: true })
    expect(await linkCounts(s, s.famChild.id)).toEqual({ assets: 0, stories: 0 })
    const renamed = await updateAlbum({ ...by, albumId: s.hidden.id, name: 'H2' }, db.prismaPublic)
    expect(renamed.name).toBe('H2')
    expect(
      await deleteAlbum({ ...by, albumId: s.shelf.id, cascade: true }, db.prismaPublic),
    ).toEqual({ removedAlbums: 2, removedAttachments: 0 })
  })
})
