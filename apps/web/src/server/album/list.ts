import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

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
  createdAt: Date
}

/**
 * List children of one parent (or roots when parentId is null).
 * Returns counts for child albums and direct asset attachments so the
 * grid can render "N장 · M개 하위 앨범" without further queries.
 *
 * `viewerRole`: family 역할에겐 비밀(secret) 앨범을 숨긴다. 부모(owner/guardian)는
 * 전부 본다. 한 레벨씩만 보여주고 비밀 앨범 상세는 family 에게 404 라, 레벨별
 * secret 필터만으로 충분히 가려진다(자식까지 따로 탐색 불가).
 */
export async function listAlbums(
  args: { familyId: string; parentId: string | null; viewerRole?: Role },
  prismaPublic: PrismaPublic,
): Promise<AlbumListItem[]> {
  const { familyId, parentId } = args
  const albums = await prismaPublic.album.findMany({
    where: {
      familyId,
      parentId,
      deletedAt: null,
      ...(args.viewerRole === 'family' ? { secret: false } : {}),
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
    createdAt: a.createdAt,
  }))
}
