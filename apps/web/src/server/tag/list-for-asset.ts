import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

export type AssetTagInfo = {
  id: string
  name: string
  slug: string
  color: string | null
}

/** Tags attached to a specific asset, ordered by attach time. */
export async function listTagsForAsset(
  args: { assetId: string; familyId: string },
  prismaPublic: PrismaPublic,
): Promise<AssetTagInfo[]> {
  const rows = await prismaPublic.assetTag.findMany({
    where: { assetId: args.assetId, familyId: args.familyId },
    orderBy: { addedAt: 'asc' },
    include: {
      tag: { select: { id: true, name: true, slug: true, color: true, deletedAt: true } },
    },
  })
  return rows
    .filter((r) => r.tag && r.tag.deletedAt === null)
    .map((r) => ({
      id: r.tag.id,
      name: r.tag.name,
      slug: r.tag.slug,
      color: r.tag.color,
    }))
}
