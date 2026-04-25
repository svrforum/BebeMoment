import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'

export type AlbumWithBreadcrumbs = Album & {
  breadcrumbs: { id: string; name: string }[]
  childCount: number
  assetCount: number
}

/**
 * Load an album, its breadcrumb chain (root → ... → self) and counts.
 * Single round-trip via the materialized path.
 */
export async function getAlbumWithBreadcrumbs(
  args: { albumId: string; familyId: string },
  prismaPublic: PrismaPublic,
): Promise<AlbumWithBreadcrumbs | null> {
  const album = await prismaPublic.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
  })
  if (!album) return null

  const ancestorIds = album.path.split('/')
  const ancestors = ancestorIds.length
    ? await prismaPublic.album.findMany({
        where: {
          id: { in: ancestorIds },
          familyId: args.familyId,
        },
        select: { id: true, name: true, path: true },
      })
    : []
  // Order to match path order (preserves tree depth order).
  const byId = new Map(ancestors.map((a) => [a.id, a]))
  const breadcrumbs = ancestorIds
    .map((id) => byId.get(id))
    .filter((a): a is { id: string; name: string; path: string } => !!a)
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
