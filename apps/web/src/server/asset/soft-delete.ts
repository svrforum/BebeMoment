import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { type AssetEvent, channelForFamily, resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type IORedis from 'ioredis'
import { ForbiddenError, NotFoundError } from '../error'

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
    throw new ForbiddenError('asset.memberOnly')
  }

  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
  if (!asset) throw new NotFoundError('asset.notFound')

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const canDelete =
    (asset.uploadedByUserId === args.byUserId &&
      resolveCan(membership.role, 'asset.delete.own', familyCaps)) ||
    resolveCan(membership.role, 'asset.delete.any', familyCaps)
  if (!canDelete) throw new ForbiddenError('asset.deleteDenied')

  await prismaMedia.asset.update({
    where: { id: args.assetId, familyId: args.familyId },
    data: { deletedAt: new Date() },
  })

  // 삭제(휴지통)된 사진은 앨범에서 빠진다 — 앨범 카운트·프리뷰가 cross-schema 라
  // 자산의 deletedAt 을 못 봐서 삭제 사진을 계속 세던 문제 해결. (복구 시 앨범 재배치는
  // 수동 — 앨범은 '현존 사진의 큐레이션'이라 트래시 사진이 남아있지 않는 게 자연스럽다.)
  await prismaPublic.albumAsset.deleteMany({
    where: { assetId: args.assetId, familyId: args.familyId },
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
