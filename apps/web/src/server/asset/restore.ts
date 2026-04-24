import { can } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

export async function restoreAsset(
  args: { assetId: string; familyId: string; byUserId: string },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<void> {
  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || !can(membership.role, 'asset.edit.any')) {
    throw new Error('No permission to restore')
  }
  await prismaMedia.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: null },
  })
}
