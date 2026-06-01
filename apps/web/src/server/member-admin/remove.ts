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
  if (!membership) throw new NotFoundError('멤버를 찾을 수 없어요')
  if (membership.userId === input.actorUserId)
    throw new ForbiddenError('본인에게는 사용할 수 없는 기능이에요')
  if (membership.role === 'owner') throw new ForbiddenError('관리자는 제외할 수 없어요')

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
      data: { deletedAt: new Date() },
    })
    await tx.session.deleteMany({ where: { userId: membership.userId } })
  })
  return { ok: true }
}
