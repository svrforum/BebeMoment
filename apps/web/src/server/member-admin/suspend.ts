import { ConflictError, ForbiddenError, NotFoundError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'
import { assertActorIsOwner } from './assert-owner'

export type SuspendMemberInput = {
  membershipId: string
  familyId: string
  actorUserId: string
  reason?: string
}

export async function suspendMember(
  input: SuspendMemberInput,
  prisma: PrismaClient,
): Promise<{ suspendedAt: Date }> {
  await assertActorIsOwner(input.actorUserId, input.familyId, prisma)
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('멤버를 찾을 수 없어요')
  if (membership.userId === input.actorUserId)
    throw new ForbiddenError('본인에게는 사용할 수 없는 기능이에요')
  if (membership.role === 'owner') throw new ForbiddenError('관리자는 정지할 수 없어요')
  if (membership.suspendedAt) throw new ConflictError('이미 정지된 상태에요')

  const suspendedAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
      data: {
        suspendedAt,
        suspendedReason: input.reason ?? null,
        suspendedByUserId: input.actorUserId,
      },
    })
    await tx.session.deleteMany({ where: { userId: membership.userId } })
  })
  return { suspendedAt }
}
