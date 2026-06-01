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
  // family 역할에겐 비밀 "조상" 아래의 비-비밀 앨범도 숨긴다 — 위 secret:false 는 자기
  // 자신만 거른다. listAlbumTree/getAlbum 의 비밀 상속 모델과 정합(§17#21). path 는
  // 조상 uuid 슬래시 결합이라 한 세그먼트라도 비밀 앨범이면 제외.
  let visible = albums
  if (args.viewerRole === 'family' && albums.length > 0) {
    const secretRows = await prismaPublic.album.findMany({
      where: { familyId: args.familyId, secret: true, deletedAt: null },
      select: { id: true },
    })
    const secretIds = new Set(secretRows.map((r) => r.id))
    visible = albums.filter((a) => !a.path.split('/').some((seg) => secretIds.has(seg)))
  }
  if (visible.length === 0) return []
  const filtered = visible

  const ids = filtered.map((a) => a.id)
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

  return filtered.map((a) => ({
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
