import { ConflictError, ForbiddenError, NotFoundError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'

export type UnsuspendMemberInput = {
  membershipId: string
  familyId: string
  actorUserId: string
}

export async function unsuspendMember(
  input: UnsuspendMemberInput,
  prisma: PrismaClient,
): Promise<{ ok: true }> {
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('멤버를 찾을 수 없어요')
  if (membership.userId === input.actorUserId)
    throw new ForbiddenError('본인에게는 사용할 수 없는 기능이에요')
  if (!membership.suspendedAt) throw new ConflictError('정지된 상태가 아니에요')

  await prisma.membership.update({
    where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
    data: { suspendedAt: null, suspendedReason: null, suspendedByUserId: null },
  })
  return { ok: true }
}
