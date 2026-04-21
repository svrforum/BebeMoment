import { can } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'

export async function softDeleteAsset(
  args: { assetId: string; familyId: string; byUserId: string },
  prisma: PrismaClient,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || membership.deletedAt) {
    throw new Error('Not a member of this family')
  }

  const asset = await prisma.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('Asset not found')

  const canDelete =
    (asset.uploadedByUserId === args.byUserId && can(membership.role, 'asset.delete.own')) ||
    can(membership.role, 'asset.delete.any')
  if (!canDelete) throw new Error('No permission to delete this asset')

  await prisma.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: new Date() },
  })
}
