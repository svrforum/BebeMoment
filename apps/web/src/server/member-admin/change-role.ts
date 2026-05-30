import { ForbiddenError, NotFoundError } from '@/server/error'
import type { PrismaClient, Role } from '@bebe/db-public'

export type ChangeMemberRoleInput = {
  membershipId: string
  familyId: string
  actorUserId: string
  role: Role
}

// owner 는 단일 가족 모델의 고정 역할 — 부여/회수 대상이 아니다. 보호자(guardian)↔가족
// (family) 전환만 허용한다. 역할은 매 요청 resolveContext 가 신선하게 읽으므로
// (쿠키 캐시 OFF) 세션 무효화는 필요 없다 — 다음 요청부터 새 권한이 적용된다.
const ASSIGNABLE: ReadonlySet<Role> = new Set<Role>(['guardian', 'family'])

export async function changeMemberRole(
  input: ChangeMemberRoleInput,
  prisma: PrismaClient,
): Promise<{ role: Role }> {
  if (!ASSIGNABLE.has(input.role)) throw new ForbiddenError('지정할 수 없는 역할이에요')

  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('멤버를 찾을 수 없어요')
  if (membership.userId === input.actorUserId)
    throw new ForbiddenError('본인 역할은 바꿀 수 없어요')
  if (membership.role === 'owner') throw new ForbiddenError('관리자 역할은 변경할 수 없어요')
  if (membership.role === input.role) return { role: membership.role }

  await prisma.membership.update({
    where: { familyId_userId: { familyId: input.familyId, userId: membership.userId } },
    data: { role: input.role },
  })
  return { role: input.role }
}
