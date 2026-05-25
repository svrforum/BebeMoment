import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

export type AlbumListItem = {
  id: string
  name: string
  description: string | null
  parentId: string | null
  coverAssetId: string | null
  depth: number
  path: string
  childCount: number
  assetCount: number
  createdAt: Date
}

/**
 * List children of one parent (or roots when parentId is null).
 * Returns counts for child albums and direct asset attachments so the
 * grid can render "N장 · M개 하위 앨범" without further queries.
 */
export async function listAlbums(
  args: { familyId: string; parentId: string | null },
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
  const { familyId, parentId } = args
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
    depth: a.depth,
    path: a.path,
    childCount: childByParent.get(a.id) ?? 0,
    assetCount: assetByAlbum.get(a.id) ?? 0,
    createdAt: a.createdAt,
  }))
}
