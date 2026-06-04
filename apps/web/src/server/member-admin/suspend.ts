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
  if (!membership) throw new NotFoundError('member.notFound')
  if (membership.userId === input.actorUserId) throw new ForbiddenError('member.selfAction')
  if (membership.role === 'owner') throw new ForbiddenError('member.ownerSuspend')
  if (membership.suspendedAt) throw new ConflictError('member.alreadySuspended')

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
