import type { Asset, PrismaClient as PrismaMedia } from '@bebe/db-media'

export async function listAssets(
  args: {
    familyId: string
    limit: number
    cursor?: { takenAt: Date; id: string }
    includeProcessing?: boolean
  },
  prismaMedia: PrismaMedia,
): Promise<Asset[]> {
  return prismaMedia.asset.findMany({
    where: {
      familyId: args.familyId,
      deletedAt: null,
      status: args.includeProcessing ? { in: ['processing', 'ready'] } : 'ready',
      ...(args.cursor
        ? {
            OR: [
              { takenAt: { lt: args.cursor.takenAt } },
              { takenAt: args.cursor.takenAt, id: { lt: args.cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    take: args.limit,
  })
}
