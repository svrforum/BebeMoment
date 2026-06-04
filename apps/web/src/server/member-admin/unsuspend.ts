import { ConflictError, ForbiddenError, NotFoundError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'
import { assertActorIsOwner } from './assert-owner'

export type UnsuspendMemberInput = {
  membershipId: string
  familyId: string
  actorUserId: string
}

export async function unsuspendMember(
  input: UnsuspendMemberInput,
  prisma: PrismaClient,
): Promise<{ ok: true }> {
  // 정지(suspend)와 대칭인 owner 전용 작업 — requireAdmin(admin OR owner) 위에
  // 가족 역할이 owner 인지 한 번 더 확인(비-owner admin 이 owner 의 정지를 못 뒤집게).
  await assertActorIsOwner(input.actorUserId, input.familyId, prisma)
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('member.notFound')
  if (membership.userId === input.actorUserId) throw new ForbiddenError('member.selfAction')
  if (!membership.suspendedAt) throw new ConflictError('member.notSuspended')

  await prisma.membership.update({
    where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
    data: { suspendedAt: null, suspendedReason: null, suspendedByUserId: null },
  })
  return { ok: true }
}
