import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAlbum } from './create'
import { getAlbumWithBreadcrumbs } from './get'
import { listAlbums } from './list'
import { listAlbumAssets } from './list-assets'
import { listAlbumEntries } from './list-entries'
import { type AlbumTreeNode, listAlbumTree } from './list-tree'
import { searchAlbums } from './search'

// 요청 밖에서 unstable_cache 는 incrementalCache 를 못 찾아 throw 한다 — 캐시 없이 그대로 부른다.
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  unstable_cache: <T>(fn: T) => fn,
}))

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
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
 * 비밀 앨범 → 그 아래 평범한 자식 → 손자, 그리고 공개 앨범 → 공개 자식. 자식·공개 앨범에는 같은
 * 사진 한 장과 (가족 공개) 스토리 하나를 담는다 — 사진·스토리가 비밀이 아니라 앨범만 비밀이다.
 */
async function setup() {
  counter += 1
  const { user } = await signup(
    { email: `album-${counter}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const make = (name: string, extra: { secret?: boolean; parentId?: string } = {}) =>
    createAlbum({ familyId: family.id, byUserId: user.id, name, ...extra }, db.prismaPublic)

  const hidden = await make('Trip hidden', { secret: true })
  const child = await make('Trip child', { parentId: hidden.id })
  const grandchild = await make('Trip grandchild', { parentId: child.id })
  const open = await make('Trip open')
  const openChild = await make('Trip open child', { parentId: open.id })

  const asset = await createAsset(
    {
      familyId: family.id,
      uploadedByUserId: user.id,
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
  await updateAssetStatus(
    { assetId: asset.id, familyId: family.id, status: 'ready' },
    db.prismaMedia,
  )
  // createStoryEntry 는 알림 큐(Redis)에 넣으므로 행을 직접 만든다.
  const story = await db.prismaPublic.story.create({
    data: {
      familyId: family.id,
      entryDate: new Date('2026-04-01'),
      body: 'b',
      createdByUserId: user.id,
      assets: { create: [{ assetId: asset.id, order: 0 }] },
    },
  })
  for (const albumId of [child.id, open.id]) {
    await db.prismaPublic.albumAsset.create({
      data: { albumId, familyId: family.id, assetId: asset.id, addedByUserId: user.id },
    })
    await db.prismaPublic.albumStory.create({
      data: { albumId, familyId: family.id, storyId: story.id, addedByUserId: user.id },
    })
  }

  return {
    familyId: family.id,
    userId: user.id,
    assetId: asset.id,
    storyId: story.id,
    hidden,
    child,
    grandchild,
    open,
    openChild,
  }
}

function flatten(nodes: AlbumTreeNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...flatten(n.children)])
}

const sorted = (ids: string[]) => [...ids].sort()

describe('family 역할은 비밀 앨범과 그 아래 앨범을 어느 경로로도 못 본다', () => {
  it('listAlbums — 루트에서 비밀 앨범이 빠지고, 비밀 조상 아래의 자식 목록은 비어 있다', async () => {
    const s = await setup()
    const list = (parentId: string | null) =>
      listAlbums({ familyId: s.familyId, parentId, viewerRole: 'family' }, db.prismaPublic)

    expect((await list(null)).map((a) => a.id)).toEqual([s.open.id])
    expect(await list(s.hidden.id)).toEqual([])
    expect(await list(s.child.id)).toEqual([])
    expect((await list(s.open.id)).map((a) => a.id)).toEqual([s.openChild.id])
  })

  it('listAlbumTree — 비밀 노드와 그 하위가 통째로 빠진다', async () => {
    const s = await setup()
    const tree = await listAlbumTree(s.familyId, 'family', db.prismaPublic)
    expect(sorted(flatten(tree))).toEqual(sorted([s.open.id, s.openChild.id]))
  })

  it('getAlbumWithBreadcrumbs — 비밀 앨범·자식·손자는 null, 공개 앨범은 열린다', async () => {
    const s = await setup()
    const get = (albumId: string) =>
      getAlbumWithBreadcrumbs(
        { albumId, familyId: s.familyId, viewerRole: 'family' },
        db.prismaPublic,
      )

    expect(await get(s.hidden.id)).toBeNull()
    expect(await get(s.child.id)).toBeNull()
    expect(await get(s.grandchild.id)).toBeNull()
    expect((await get(s.openChild.id))?.breadcrumbs.map((b) => b.id)).toEqual([
      s.open.id,
      s.openChild.id,
    ])
  })

  it('searchAlbums — 이름이 맞아도 비밀 앨범과 그 하위는 결과에 없다', async () => {
    const s = await setup()
    const found = await searchAlbums(
      { familyId: s.familyId, q: 'Trip', viewerRole: 'family' },
      db.prismaPublic,
    )
    expect(sorted(found.map((a) => a.id))).toEqual(sorted([s.open.id, s.openChild.id]))
  })

  it('listAlbumAssets — 비밀 조상 아래 앨범의 사진 목록은 비어 있다', async () => {
    const s = await setup()
    const assets = (albumId: string) =>
      listAlbumAssets(
        { albumId, familyId: s.familyId, viewerRole: 'family' },
        db.prismaPublic,
        db.prismaMedia,
        new FakeMediaClient(),
      )

    expect(await assets(s.child.id)).toEqual({ assets: [], total: 0, truncated: false })
    expect((await assets(s.open.id)).assets.map((a) => a.id)).toEqual([s.assetId])
  })

  it('listAlbumEntries — 비밀 조상 아래 앨범의 스토리 목록은 비어 있다', async () => {
    const s = await setup()
    const entries = (albumId: string) =>
      listAlbumEntries(
        { albumId, familyId: s.familyId, viewerRole: 'family' },
        db.prismaPublic,
        db.prismaMedia,
        new FakeMediaClient(),
      )

    expect(await entries(s.child.id)).toEqual([])
    expect((await entries(s.open.id)).map((e) => e.id)).toEqual([s.storyId])
  })
})

// 지운 앨범은 비밀 판정(살아 있는 앨범만 본다)을 그냥 지나친다. 뷰어 이웃 목록
// (ctx=album:<id>)은 이 두 함수만 거치므로, 지운 비밀 앨범의 UUID 하나로 그 안의 사진 순서가 드러났다.
describe.each(['family', 'owner'] as const)(
  '%s — 지운 앨범의 사진·스토리 목록은 비어 있다',
  (role) => {
    it('비밀 앨범을 하위째 지운 뒤, 그리고 공개 앨범을 지운 뒤', async () => {
      const s = await setup()
      await db.prismaPublic.album.updateMany({
        where: { familyId: s.familyId, id: { in: [s.hidden.id, s.child.id, s.grandchild.id] } },
        data: { deletedAt: new Date() },
      })
      await db.prismaPublic.album.update({
        where: { id: s.open.id },
        data: { deletedAt: new Date() },
      })
      const media = new FakeMediaClient()
      for (const albumId of [s.child.id, s.open.id]) {
        const args = { albumId, familyId: s.familyId, viewerRole: role }
        expect(await listAlbumAssets(args, db.prismaPublic, db.prismaMedia, media)).toEqual({
          assets: [],
          total: 0,
          truncated: false,
        })
        expect(await listAlbumEntries(args, db.prismaPublic, db.prismaMedia, media)).toEqual([])
      }
    })
  },
)

describe('하위 앨범 수', () => {
  // 공개 앨범 아래 비밀 자식이 하나 있다. family 에게 "하위 앨범 2개" 라고 보여 주면 열 수 없는
  // 앨범이 하나 더 있다는 사실이 드러난다 — 목록·검색·상세가 같은 수를 내야 한다.
  async function childCounts(viewerRole: 'owner' | 'guardian' | 'family') {
    const s = await setup()
    await createAlbum(
      {
        familyId: s.familyId,
        byUserId: s.userId,
        name: 'Trip open hidden child',
        parentId: s.open.id,
        secret: true,
      },
      db.prismaPublic,
    )
    const listed = await listAlbums(
      { familyId: s.familyId, parentId: null, viewerRole },
      db.prismaPublic,
    )
    const found = await searchAlbums(
      { familyId: s.familyId, q: 'Trip open', viewerRole },
      db.prismaPublic,
    )
    const detail = await getAlbumWithBreadcrumbs(
      { albumId: s.open.id, familyId: s.familyId, viewerRole },
      db.prismaPublic,
    )
    return {
      listed: listed.find((a) => a.id === s.open.id)?.childCount,
      searched: found.find((a) => a.id === s.open.id)?.childCount,
      detail: detail?.childCount,
    }
  }

  it('family 에겐 비밀 자식을 세지 않는다', async () => {
    expect(await childCounts('family')).toEqual({ listed: 1, searched: 1, detail: 1 })
  })

  it.each(['owner', 'guardian'] as const)('%s 에겐 비밀 자식도 센다', async (role) => {
    expect(await childCounts(role)).toEqual({ listed: 2, searched: 2, detail: 2 })
  })
})

describe.each(['owner', 'guardian'] as const)('%s 역할은 비밀 앨범 트리를 전부 본다', (role) => {
  it('목록·트리·상세·검색·사진·스토리', async () => {
    const s = await setup()
    const all = [s.hidden.id, s.child.id, s.grandchild.id, s.open.id, s.openChild.id]
    const media = new FakeMediaClient()

    const roots = await listAlbums(
      { familyId: s.familyId, parentId: null, viewerRole: role },
      db.prismaPublic,
    )
    expect(sorted(roots.map((a) => a.id))).toEqual(sorted([s.hidden.id, s.open.id]))
    const children = await listAlbums(
      { familyId: s.familyId, parentId: s.hidden.id, viewerRole: role },
      db.prismaPublic,
    )
    expect(children.map((a) => a.id)).toEqual([s.child.id])
    expect(sorted(flatten(await listAlbumTree(s.familyId, role, db.prismaPublic)))).toEqual(
      sorted(all),
    )
    const detail = await getAlbumWithBreadcrumbs(
      { albumId: s.grandchild.id, familyId: s.familyId, viewerRole: role },
      db.prismaPublic,
    )
    expect(detail?.id).toBe(s.grandchild.id)
    const found = await searchAlbums(
      { familyId: s.familyId, q: 'Trip', viewerRole: role },
      db.prismaPublic,
    )
    expect(sorted(found.map((a) => a.id))).toEqual(sorted(all))
    const assets = await listAlbumAssets(
      { albumId: s.child.id, familyId: s.familyId, viewerRole: role },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(assets.assets.map((a) => a.id)).toEqual([s.assetId])
    const entries = await listAlbumEntries(
      { albumId: s.child.id, familyId: s.familyId, viewerRole: role },
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(entries.map((e) => e.id)).toEqual([s.storyId])
  })
})

// 빠뜨리면 비밀 앨범이 열리는 쪽으로 기울던 인자다 — 다시 선택 인자가 되면 아래의 기대한
// 타입 에러가 사라져 typecheck 가 깨진다. 함수는 만들기만 하고 부르지 않는다.
it('viewerRole 은 모든 앨범 읽기 함수의 필수 인자다', () => {
  const omitsViewerRole = (pub: PrismaPublic, med: PrismaMedia) => {
    const m = new FakeMediaClient()
    // @ts-expect-error viewerRole 누락
    void listAlbums({ familyId: 'f', parentId: null }, pub)
    // @ts-expect-error viewerRole 누락
    void getAlbumWithBreadcrumbs({ albumId: 'a', familyId: 'f' }, pub)
    // @ts-expect-error viewerRole 누락
    void searchAlbums({ familyId: 'f', q: 'q' }, pub)
    // @ts-expect-error viewerRole 누락
    void listAlbumAssets({ albumId: 'a', familyId: 'f' }, pub, med, m)
    // @ts-expect-error viewerRole 누락
    void listAlbumEntries({ albumId: 'a', familyId: 'f' }, pub, med, m)
  }
  expect(omitsViewerRole).toBeTypeOf('function')
})
