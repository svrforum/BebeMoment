import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import { unstable_cache } from 'next/cache'

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
 * 후처리 — listAlbumTree 와 같은 패턴.
 */
export async function listAlbums(
  args: { familyId: string; parentId: string | null; viewerRole?: Role },
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
  const { familyId, parentId, viewerRole } = args
  const all = await unstable_cache(
    () => listAlbumsRaw(familyId, parentId, prismaPublic),
    ['album-list', familyId, parentId ?? 'root'],
    { revalidate: 60, tags: [`albums:${familyId}`] },
  )()
  return viewerRole === 'family' ? all.filter((a) => !a.secret) : all
}

async function listAlbumsRaw(
  familyId: string,
  parentId: string | null,
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
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
      by: ['parentId'],
      where: { familyId, parentId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prismaPublic.albumAsset.groupBy({
      by: ['albumId'],
      where: { familyId, albumId: { in: ids } },
      _count: { _all: true },
    }),
  ])

  const childByParent = new Map(childCounts.map((c) => [c.parentId, c._count._all]))
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
    childCount: childByParent.get(a.id) ?? 0,
    assetCount: assetByAlbum.get(a.id) ?? 0,
    createdAt: a.createdAt.getTime(),
  }))
}
