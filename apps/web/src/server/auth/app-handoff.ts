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
  const row = await prisma.appAuthHandoff.findUnique({ where: { code: input.code } })
  if (!row) throw new Error('유효하지 않은 코드예요')
  await prisma.appAuthHandoff.delete({ where: { code: input.code } })
  if (row.expiresAt.getTime() < Date.now()) throw new Error('만료된 코드예요')
  if (hashVerifier(input.verifier) !== row.verifierHash) throw new Error('검증에 실패했어요')
  return { userId: row.userId, currentFamilyId: row.currentFamilyId }
}
