import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { AlbumListItem } from './list'

/**
 * Flat album search by name (case-insensitive), across the whole tree.
 * family 역할에겐 비밀 앨범 제외. AlbumListItem 으로 반환해 그리드가 listAlbums
 * 결과와 동일하게 렌더.
 */
export async function searchAlbums(
  args: { familyId: string; q: string; viewerRole?: Role; limit?: number },
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
  const q = args.q.trim()
  if (!q) return []

  const albums = await prismaPublic.album.findMany({
    where: {
      familyId: args.familyId,
      deletedAt: null,
      name: { contains: q, mode: 'insensitive' },
      ...(args.viewerRole === 'family' ? { secret: false } : {}),
    },
    orderBy: [{ name: 'asc' }],
    take: args.limit ?? 50,
  })
  if (albums.length === 0) return []

  const ids = albums.map((a) => a.id)
  const [childCounts, assetCounts] = await Promise.all([
    prismaPublic.album.groupBy({
      by: ['parentId'],
      where: { familyId: args.familyId, parentId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
    prismaPublic.albumAsset.groupBy({
      by: ['albumId'],
      where: { familyId: args.familyId, albumId: { in: ids } },
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
    createdAt: a.createdAt,
  }))
}
