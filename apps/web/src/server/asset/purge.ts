import { getMediaClient } from '@/lib/media-client'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'

/**
 * Permanent-delete (purge) an asset already in the trash. Gated on
 * `asset.delete.any` — owner / guardian only (or family role when an admin
 * has granted that capability via family-capabilities). `asset.delete.own`
 * is intentionally NOT enough: that's the soft-delete privilege; the
 * permanent action stays higher-trust.
 */
export async function purgeAsset(
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

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(membership.role, 'asset.delete.any', familyCaps)) {
    throw new ForbiddenError('asset.purgeDenied')
  }

  // Verify the asset is actually in this family's trash before crossing the
  // network boundary. media will re-check, but failing fast here gives a
  // cleaner 400 to the client and avoids burning an HTTP call.
  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId },
  })
  if (!asset) throw new NotFoundError('asset.notFound')
  if (!asset.deletedAt) throw new ConflictError('asset.notInTrash')

  await getMediaClient().purgeAsset(args.assetId, args.familyId)
}
