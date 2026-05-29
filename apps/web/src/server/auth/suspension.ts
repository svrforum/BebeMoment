import type { PrismaClient } from '@bebe/db-public'

/**
 * 비-삭제 멤버십이 하나라도 있고 그게 전부 정지 상태면 true.
 * 멤버십이 아예 없으면(가입 직전 OIDC 신규 등) false — 로그인 자체는 허용.
 */
export async function isUserFullySuspended(userId: string, prisma: PrismaClient): Promise<boolean> {
  const memberships = await prisma.membership.findMany({
    where: { userId, deletedAt: null },
  })
  return memberships.length > 0 && memberships.every((m) => m.suspendedAt !== null)
}
