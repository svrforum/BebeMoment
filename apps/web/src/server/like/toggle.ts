import type { AssetEvent } from '@bebe/core'
import { can, channelForFamily } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type IORedis from 'ioredis'
import { z } from 'zod'
import { isUniqueViolation } from '../prisma-errors'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function toggleLike(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  publisher?: IORedis,
): Promise<{ liked: boolean; count: number }> {
  const input = Input.parse(raw)

  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('asset not found in this family')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'social.react')) {
    throw new Error('No permission: not a member of this family')
  }

  const existing = await prismaPublic.assetLike.findFirst({
    where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
  })

  if (existing) {
    await prismaPublic.assetLike.deleteMany({
      where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
    })
  } else {
    try {
      await prismaPublic.assetLike.create({
        data: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
      })
    } catch (e) {
      // 동시 토글(중복 탭·재시도)로 이미 생성됨 — 멱등하게 좋아요 상태로 본다.
      if (!isUniqueViolation(e)) throw e
    }
  }

  const count = await prismaPublic.assetLike.count({
    where: { assetId: input.assetId, familyId: input.familyId },
  })
  const liked = !existing

  if (publisher) {
    const event: AssetEvent = {
      type: 'like.changed',
      familyId: input.familyId,
      assetId: input.assetId,
      userId: input.byUserId,
      liked,
    }
    await publisher.publish(channelForFamily(input.familyId), JSON.stringify(event))
  }
  return { liked, count }
}
