import crypto from 'node:crypto'
import type { PrismaClient } from '@bebe/db-public'

const TTL_MS = 3 * 60 * 1000

export function hashVerifier(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// 외부 브라우저 OIDC 완료 후 1회용 핸드오프 코드 발급. 앱이 deep link 로 받는다.
// challenge = sha256(verifier) (앱이 생성한 verifier 의 해시) — 교환 시 원본 verifier 로
// 검증해 deep link 가로채기(다른 앱)를 막는다(PKCE식).
export async function createAppHandoff(
  input: { userId: string; currentFamilyId: string | null; challenge: string },
  prisma: PrismaClient,
): Promise<{ code: string }> {
  // sha256(verifier) base64url = 정확히 43자 [A-Za-z0-9_-]. 형식 강제로 full-entropy
  // verifier 에 대응하는 해시만 저장한다(약한 challenge 거부).
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.challenge)) throw new Error('auth.handoffBadChallenge')
  // 버려진(미교환) 만료 핸드오프 청소 — 이 테이블엔 usedAt 톰스톤이 없어 미교환 행이
  // 영원히 남으므로 발급 시점에 만료분을 쓸어낸다(베스트에포트).
  await prisma.appAuthHandoff
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {})
  const code = crypto.randomBytes(32).toString('base64url')
  await prisma.appAuthHandoff.create({
    data: {
      code,
      userId: input.userId,
      currentFamilyId: input.currentFamilyId,
      verifierHash: input.challenge,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  })
  return { code }
}

// 코드 + verifier 를 세션 신원으로 교환. 코드는 1회용(찾는 즉시 삭제) — 만료·검증 실패여도
// 재사용 불가. verifier 의 sha256 이 저장된 challenge 와 같아야 한다.
export async function exchangeAppHandoff(
  input: { code: string; verifier: string },
  prisma: PrismaClient,
): Promise<{ userId: string; currentFamilyId: string | null }> {
  // 원자적 1회용: delete 가 row 를 반환하며 동시요청 중 하나만 성공(나머지는 P2025).
  // findUnique→delete 분리(TOCTOU) 대신 delete 로 코드를 '청구'한 뒤 검증한다.
  let row: Awaited<ReturnType<typeof prisma.appAuthHandoff.delete>>
  try {
    row = await prisma.appAuthHandoff.delete({ where: { code: input.code } })
  } catch {
    throw new Error('auth.handoffInvalidCode')
  }
  if (row.expiresAt.getTime() < Date.now()) throw new Error('auth.handoffExpiredCode')
  if (hashVerifier(input.verifier) !== row.verifierHash) throw new Error('auth.handoffVerifyFailed')
  return { userId: row.userId, currentFamilyId: row.currentFamilyId }
}
