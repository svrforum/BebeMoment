import type { Album, PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

export type AlbumWithBreadcrumbs = Album & {
  breadcrumbs: { id: string; name: string }[]
  childCount: number
  assetCount: number
}

/**
 * Load an album, its breadcrumb chain (root → ... → self) and counts.
 * Single round-trip via the materialized path.
 *
 * `viewerRole`: family 역할에겐 비밀 앨범(자신 또는 조상이 secret)을 null 로 가린다
 * → 라우트가 404 처리. 직접 URL 로 비밀 앨범의 하위에 접근하는 누출도 막는다.
 */
export async function getAlbumWithBreadcrumbs(
  args: { albumId: string; familyId: string; viewerRole?: Role },
  prismaPublic: PrismaPublic,
): Promise<AlbumWithBreadcrumbs | null> {
  const album = await prismaPublic.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
  })
  if (!album) return null
  if (args.viewerRole === 'family' && album.secret) return null

  const ancestorIds = album.path.split('/')
  const ancestors = ancestorIds.length
    ? await prismaPublic.album.findMany({
        where: {
          id: { in: ancestorIds },
          familyId: args.familyId,
        },
        select: { id: true, name: true, path: true, secret: true },
      })
    : []
  if (args.viewerRole === 'family' && ancestors.some((a) => a.secret)) return null
  // Order to match path order (preserves tree depth order).
  const byId = new Map(ancestors.map((a) => [a.id, a]))
  const breadcrumbs = ancestorIds
    .map((id) => byId.get(id))
    .filter((a): a is { id: string; name: string; path: string; secret: boolean } => !!a)
    .map((a) => ({ id: a.id, name: a.name }))

  const [childCount, assetCount] = await Promise.all([
    prismaPublic.album.count({
      where: { familyId: args.familyId, parentId: album.id, deletedAt: null },
    }),
    prismaPublic.albumAsset.count({
      where: { familyId: args.familyId, albumId: album.id },
    }),
  ])

  return {
    ...album,
    breadcrumbs,
    childCount,
    assetCount,
  }
}
