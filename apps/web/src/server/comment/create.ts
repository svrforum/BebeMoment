import type { AssetEvent } from '@bebe/core'
import { can, channelForFamily } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetComment, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type IORedis from 'ioredis'
import { z } from 'zod'
import { type EnqueueNotification, enqueueNotification } from '../notifications/enqueue'
import { isAssetHiddenFromViewer } from '../story/secret-assets'
import { parseMentions } from './parse-mentions'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  byUserId: z.string().uuid(),
})

export async function createComment(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  publisher?: IORedis,
  enqueue: EnqueueNotification = enqueueNotification,
): Promise<AssetComment> {
  const input = Input.parse(raw)

  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('asset not found in this family')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'social.comment.create')) {
    throw new Error('No permission: not a member of this family')
  }

  if (
    membership.role === 'family' &&
    (await isAssetHiddenFromViewer('family', input.assetId, prismaPublic, input.familyId))
  ) {
    throw new Error('asset not found in this family')
  }

  const familyMembers = await prismaPublic.membership.findMany({
    where: { familyId: input.familyId, deletedAt: null, userId: { not: input.byUserId } },
    include: { user: { select: { id: true, displayName: true } } },
  })
  const members = familyMembers.map((m) => ({ id: m.user.id, displayName: m.user.displayName }))
  const mentionedUserIds = parseMentions(input.body, members)

  const comment = await prismaPublic.assetComment.create({
    data: {
      assetId: input.assetId,
      familyId: input.familyId,
      authorUserId: input.byUserId,
      body: input.body,
      mentionedUserIds,
    },
  })

  if (publisher) {
    const event: AssetEvent = {
      type: 'comment.added',
      familyId: input.familyId,
      assetId: input.assetId,
      commentId: comment.id,
    }
    await publisher.publish(channelForFamily(input.familyId), JSON.stringify(event))
  }

  await enqueue({
    familyId: input.familyId,
    actorUserId: input.byUserId,
    type: 'comment.created',
    // 멘션 전용 알림 — 워커가 mentionedUserIds 로 수신자를 좁힌다(payload 는
    // Record<string,string> 라 배열은 JSON 문자열로).
    payload: {
      assetId: input.assetId,
      commentId: comment.id,
      mentionedUserIds: JSON.stringify(mentionedUserIds),
    },
  })

  return comment
}
