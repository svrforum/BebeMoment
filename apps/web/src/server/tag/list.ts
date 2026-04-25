import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

export type TagWithCount = {
  id: string
  name: string
  slug: string
  color: string | null
  assetCount: number
  createdAt: Date
}

/**
 * List active tags in a family with their attached-asset counts.
 * Single round-trip via `groupBy` joined back onto tags.
 */
export async function listTagsWithCounts(
  familyId: string,
  prismaPublic: PrismaPublic,
): Promise<TagWithCount[]> {
  const tags = await prismaPublic.tag.findMany({
    where: { familyId, deletedAt: null },
    orderBy: [{ updatedAt: 'desc' }],
  })
  if (tags.length === 0) return []

  const counts = await prismaPublic.assetTag.groupBy({
    by: ['tagId'],
    where: { familyId, tagId: { in: tags.map((t) => t.id) } },
    _count: { _all: true },
  })
  const countByTag = new Map(counts.map((c) => [c.tagId, c._count._all]))

  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    assetCount: countByTag.get(t.id) ?? 0,
    createdAt: t.createdAt,
  }))
}
