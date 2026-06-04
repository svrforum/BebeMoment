import { ForbiddenError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'

/**
 * 멤버 관리의 위험 작업(정지·제외·비밀번호 재설정)은 MATRIX 상 owner 전용이다.
 * 라우트의 requireAdmin 은 인스턴스 admin(ADMIN_USER_EMAIL) OR owner 를 통과시키므로,
 * 이메일 admin 으로 등록된 guardian 이 통과할 수 있다 — 실제 강제는 actor 의 가족 역할이
 * owner 인지 여기서 확인한다.
 */
export async function assertActorIsOwner(
  actorUserId: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<void> {
  const actor = await prisma.membership.findFirst({
    where: { userId: actorUserId, familyId, deletedAt: null },
    select: { role: true },
  })
  if (actor?.role !== 'owner') throw new ForbiddenError('member.ownerOnly')
}
