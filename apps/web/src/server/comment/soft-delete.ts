import type { AssetEvent } from '@bebe/core'
import { can, channelForFamily } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'
import type IORedis from 'ioredis'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function softDeleteComment(
  raw: unknown,
  prisma: PrismaClient,
  publisher?: IORedis,
): Promise<void> {
  const input = Input.parse(raw)

  const existing = await prisma.assetComment.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!existing) throw new Error('Comment not found')

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')

  const isOwn = existing.authorUserId === input.byUserId
  const capability = isOwn ? 'social.comment.delete.own' : 'social.comment.delete.any'
  if (!can(membership.role, capability)) {
    throw new Error('No permission to delete this comment')
  }

  await prisma.assetComment.update({
    where: { id: input.id },
    data: { deletedAt: new Date() },
  })

  if (publisher) {
    const event: AssetEvent = {
      type: 'comment.deleted',
      familyId: input.familyId,
      assetId: existing.assetId,
      commentId: existing.id,
    }
    await publisher.publish(channelForFamily(input.familyId), JSON.stringify(event))
  }
}
