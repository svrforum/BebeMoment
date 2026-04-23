import type { AssetEvent } from '@bebe/core'
import { can, channelForFamily } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'
import type IORedis from 'ioredis'
import { z } from 'zod'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function toggleLike(
  raw: unknown,
  prisma: PrismaClient,
  publisher?: IORedis,
): Promise<{ liked: boolean; count: number }> {
  const input = Input.parse(raw)

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('asset not found in this family')

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'social.react')) {
    throw new Error('No permission: not a member of this family')
  }

  const existing = await prisma.assetLike.findUnique({
    where: { assetId_userId: { assetId: input.assetId, userId: input.byUserId } },
  })

  if (existing) {
    await prisma.assetLike.delete({
      where: { assetId_userId: { assetId: input.assetId, userId: input.byUserId } },
    })
  } else {
    await prisma.assetLike.create({
      data: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
    })
  }

  const count = await prisma.assetLike.count({
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
