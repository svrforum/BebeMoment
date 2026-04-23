import type { AssetEvent } from '@bebe/core'
import { can, channelForFamily } from '@bebe/core'
import type { AssetComment, PrismaClient } from '@bebe/db'
import type IORedis from 'ioredis'
import { z } from 'zod'
import { parseMentions } from './parse-mentions'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  byUserId: z.string().uuid(),
})

export async function updateComment(
  raw: unknown,
  prisma: PrismaClient,
  publisher?: IORedis,
): Promise<AssetComment> {
  const input = Input.parse(raw)

  const existing = await prisma.assetComment.findFirst({
    where: { id: input.id, familyId: input.familyId },
  })
  if (!existing) throw new Error('Comment not found')
  if (existing.deletedAt) throw new Error('삭제된 댓글이에요')

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')

  if (existing.authorUserId !== input.byUserId) {
    throw new Error('본인 댓글만 편집할 수 있어요')
  }
  if (!can(membership.role, 'social.comment.edit.own')) {
    throw new Error('No permission to edit this comment')
  }

  const familyMembers = await prisma.membership.findMany({
    where: { familyId: input.familyId, deletedAt: null, userId: { not: input.byUserId } },
    include: { user: { select: { id: true, displayName: true } } },
  })
  const members = familyMembers.map((m) => ({ id: m.user.id, displayName: m.user.displayName }))
  const mentionedUserIds = parseMentions(input.body, members)

  const updated = await prisma.assetComment.update({
    where: { id: input.id },
    data: {
      body: input.body,
      mentionedUserIds,
      editedAt: new Date(),
    },
  })

  if (publisher) {
    const event: AssetEvent = {
      type: 'comment.updated',
      familyId: input.familyId,
      assetId: updated.assetId,
      commentId: updated.id,
    }
    await publisher.publish(channelForFamily(input.familyId), JSON.stringify(event))
  }
  return updated
}
