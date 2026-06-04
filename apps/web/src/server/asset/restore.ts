import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { ForbiddenError, NotFoundError } from '../error'

export async function restoreAsset(
  args: { assetId: string; familyId: string; byUserId: string },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<void> {
  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || membership.deletedAt) {
    throw new ForbiddenError('asset.memberOnly')
  }

  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId },
  })
  if (!asset) throw new NotFoundError('asset.notFound')

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const canRestore =
    (asset.uploadedByUserId === args.byUserId &&
      resolveCan(membership.role, 'asset.delete.own', familyCaps)) ||
    resolveCan(membership.role, 'asset.delete.any', familyCaps)
  if (!canRestore) throw new ForbiddenError('asset.restoreDenied')

  await prismaMedia.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: null },
  })
}
