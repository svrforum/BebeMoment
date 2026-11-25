import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import { unstable_cache } from 'next/cache'
import { isAlbumSecretForViewer } from './secret-visibility'

export type AlbumListItem = {
  id: string
  name: string
  description: string | null
  parentId: string | null
  coverAssetId: string | null
  secret: boolean
  depth: number
  path: string
  childCount: number
  assetCount: number
  // Stored as number (ms since epoch) because this struct round-trips
  // through `unstable_cache` which JSON-serializes payloads — Date objects
  // come back as ISO strings after a cache hit and break consumers that
  // call `.getTime()`. Same pattern as `listTagsWithCounts.createdAt`.
  createdAt: number
}

/**
 * List children of one parent (or roots when parentId is null).
 * Returns counts for child albums and direct asset attachments so the
 * grid can render "N장 · M개 하위 앨범" without further queries.
 *
 * Cached per family + parent for 60s with tag `albums:${familyId}` so the
 * top-level /albums grid doesn't re-issue three groupBy queries on every
 * navigation. Mutations (create/update/move/delete/attach/detach) already
 * fire `revalidateTag('albums:${familyId}')` so the cache pops on writes.
 *
 * `viewerRole`: family 역할에겐 비밀(secret) 앨범을 숨긴다. 부모(owner/guardian)는
 * 전부 본다. 캐시는 role-agnostic(전체) 로 둔 뒤 호출 측에서 viewerRole 로
 * 후처리 — listAlbumTree 와 같은 패턴. 부모 자체가 비밀이거나 비밀 조상 아래면 자식 목록은
 * 통째로 비운다 — 자식의 secret 플래그만 보면 `?parentId=<비밀 앨범>` 으로 그 안의 평범한
 * 하위 앨범이 드러난다. 하위 앨범 수도 family 에겐 비밀 자식을 뺀 수다(열 수 없는 앨범이
 * 있다는 사실이 숫자로 새지 않게).
 */
export async function listAlbums(
  args: { familyId: string; parentId: string | null; viewerRole: Role },
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
  const { familyId, parentId, viewerRole } = args
  if (
    parentId !== null &&
    (await isAlbumSecretForViewer({ albumId: parentId, familyId, viewerRole }, prismaPublic))
  ) {
    return []
  }
  const all = await unstable_cache(
    () => listAlbumsRaw(familyId, parentId, prismaPublic),
    // 담기는 모양이 바뀌면 키도 바꾼다 — 배포 직후 옛 모양의 캐시가 돌아오면 안 된다.
    ['album-list-v2', familyId, parentId ?? 'root'],
    { revalidate: 60, tags: [`albums:${familyId}`] },
  )()
  const family = viewerRole === 'family'
  return all
    .filter((a) => !family || !a.secret)
    .map(({ childCounts, ...a }) => ({
      ...a,
      childCount: family ? childCounts.open : childCounts.all,
    }))
}

type RawAlbumListItem = Omit<AlbumListItem, 'childCount'> & {
  childCounts: { all: number; open: number }
}

async function listAlbumsRaw(
  familyId: string,
  parentId: string | null,
  prismaPublic: PrismaPublic,
): Promise<RawAlbumListItem[]> {
  const albums = await prismaPublic.album.findMany({
    where: {
      familyId,
      parentId,
      deletedAt: null,
    },
    orderBy: [{ sortIndex: 'asc' }, { createdAt: 'asc' }],
  })
  if (albums.length === 0) return []

  const ids = albums.map((a) => a.id)

  const [childCounts, assetCounts] = await Promise.all([
    prismaPublic.album.groupBy({
      by: ['parentId', 'secret'],
      where: { familyId, parentId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prismaPublic.albumAsset.groupBy({
      by: ['albumId'],
      where: { familyId, albumId: { in: ids } },
      _count: { _all: true },
    }),
  ])

  const childByParent = new Map<string, { all: number; open: number }>()
  for (const c of childCounts) {
    if (!c.parentId) continue
    const n = childByParent.get(c.parentId) ?? { all: 0, open: 0 }
    n.all += c._count._all
    if (!c.secret) n.open += c._count._all
    childByParent.set(c.parentId, n)
  }
  const assetByAlbum = new Map(assetCounts.map((c) => [c.albumId, c._count._all]))

  return albums.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    parentId: a.parentId,
    coverAssetId: a.coverAssetId,
    secret: a.secret,
    depth: a.depth,
    path: a.path,
    childCounts: childByParent.get(a.id) ?? { all: 0, open: 0 },
    assetCount: assetByAlbum.get(a.id) ?? 0,
    createdAt: a.createdAt.getTime(),
  }))
}
