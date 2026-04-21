import { can } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'

export async function restoreAsset(
  args: { assetId: string; familyId: string; byUserId: string },
  prisma: PrismaClient,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || !can(membership.role, 'asset.edit.any')) {
    throw new Error('No permission to restore')
  }
  await prisma.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: null },
  })
}
