import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { type AssetEvent, channelForFamily, resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type IORedis from 'ioredis'

export async function softDeleteAsset(
  args: { assetId: string; familyId: string; byUserId: string },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  publisher?: IORedis,
): Promise<void> {
  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || membership.deletedAt) {
    throw new Error('Not a member of this family')
  }

  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('Asset not found')

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const canDelete =
    (asset.uploadedByUserId === args.byUserId &&
      resolveCan(membership.role, 'asset.delete.own', familyCaps)) ||
    resolveCan(membership.role, 'asset.delete.any', familyCaps)
  if (!canDelete) throw new Error('No permission to delete this asset')

  await prismaMedia.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: new Date() },
  })

  if (publisher) {
    const event: AssetEvent = {
      type: 'asset.deleted',
      familyId: args.familyId,
      assetId: args.assetId,
    }
    await publisher.publish(channelForFamily(args.familyId), JSON.stringify(event)).catch(() => {})
  }
}
