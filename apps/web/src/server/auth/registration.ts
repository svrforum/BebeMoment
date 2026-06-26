import type { PrismaClient } from '@bebe/db-public'

// 공개 가입 개방 여부의 단일 기준: 이 인스턴스에 가족이 하나도 없는가(부트스트랩).
// 이건 의도적으로 **테넌트 비종속** 전역 카운트다 — tenant 미들웨어(§8)는 familyId
// 없는 Family.count() 를 막으므로($extends 가 모델 op 만 가로챔) raw 쿼리로 우회한다.
// 카운트는 스칼라라 다른 가족 행이 새지 않는다.
export async function isRegistrationOpen(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM families`
  return (rows[0]?.count ?? 0n) === 0n
}

/**
 * 최초(부트스트랩) 가입 허용 여부. `SETUP_TOKEN` 환경변수가 설정돼 있으면 일치하는 토큰을
 * 줘야만 첫 소유자 계정을 만들 수 있다 — 공개 URL 에 먼저 접속한 사람이 owner/admin 을
 * 선점하는 landrush 를 막는다(노출 전 LAN 세팅이 어려운 경우의 방어막). 미설정이면 항상
 * true 라 기본 단일가족 UX 는 그대로다.
 */
export function isBootstrapSetupAllowed(providedToken: string | undefined): boolean {
  const required = process.env.SETUP_TOKEN?.trim()
  if (!required) return true
  return providedToken === required
}

export async function validateInviteForSignup(
  token: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { token } })
  if (!invite) return false
  if (invite.acceptedAt || invite.revokedAt) return false
  if (invite.expiresAt.getTime() < Date.now()) return false
  return true
}
