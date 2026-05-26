import type { PrismaClient } from '@bebe/db-public'

// 공개 가입 개방 여부의 단일 기준: 이 인스턴스에 가족이 하나도 없는가(부트스트랩).
// 이건 의도적으로 **테넌트 비종속** 전역 카운트다 — tenant 미들웨어(§8)는 familyId
// 없는 Family.count() 를 막으므로($extends 가 모델 op 만 가로챔) raw 쿼리로 우회한다.
// 카운트는 스칼라라 다른 가족 행이 새지 않는다.
export async function isRegistrationOpen(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM families`
  return (rows[0]?.count ?? 0n) === 0n
}

export async function validateInviteForSignup(
  token: string,
  email: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { token } })
  if (!invite) return false
  if (invite.acceptedAt || invite.revokedAt) return false
  if (invite.expiresAt.getTime() < Date.now()) return false
  return invite.email.toLowerCase() === email.toLowerCase()
}
