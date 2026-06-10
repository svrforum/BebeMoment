import { ForbiddenError, NotFoundError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'
import { assertActorIsOwner } from './assert-owner'

export type RemoveMemberInput = {
  membershipId: string
  familyId: string
  actorUserId: string
}

export async function removeMember(
  input: RemoveMemberInput,
  prisma: PrismaClient,
): Promise<{ ok: true }> {
  await assertActorIsOwner(input.actorUserId, input.familyId, prisma)
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('member.notFound')
  if (membership.userId === input.actorUserId) throw new ForbiddenError('member.selfAction')
  if (membership.role === 'owner') throw new ForbiddenError('member.ownerRemove')

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
      data: { deletedAt: new Date() },
    })
    await tx.session.deleteMany({ where: { userId: membership.userId } })
    // 제외된 멤버의 푸시 구독·기기 토큰·위젯 토큰도 정리 — 안 그러면 기기에 가족 푸시가
    // 계속 가고 위젯 bearer 토큰 행이 잔류한다(단일 가족 모델이라 user-scoped 전체 삭제 =
    // 이 가족 구독 전체).
    await tx.pushSubscription.deleteMany({ where: { userId: membership.userId } })
    await tx.devicePushToken.deleteMany({ where: { userId: membership.userId } })
    await tx.widgetToken.deleteMany({ where: { userId: membership.userId } })
  })
  return { ok: true }
}
