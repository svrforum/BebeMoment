import type { PrismaClient } from '@bebe/db-public'

export type ShareResolution =
  | { status: 'ok'; storyId: string; familyId: string }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'notfound' }

/**
 * 공개 공유 라우트(/s/<token>)용 토큰 해석. 세션/familyId 없는 무인증 라우트라 tenant
 * 미들웨어를 raw 쿼리로 우회한다(§8, isRegistrationOpen 패턴). 만료·해제 상태를 구분해
 * 반환(라우트가 안내 문구를 다르게). 유효하면 last_accessed_at 갱신(best-effort).
 */
export async function resolveShareLink(
  token: string,
  prisma: PrismaClient,
): Promise<ShareResolution> {
  if (!token || token.length > 200) return { status: 'notfound' }
  const rows = await prisma.$queryRaw<
    { story_id: string; family_id: string; expires_at: Date | null; revoked_at: Date | null }[]
  >`
    SELECT story_id, family_id, expires_at, revoked_at
    FROM share_links WHERE token = ${token} LIMIT 1
  `
  const row = rows[0]
  if (!row) return { status: 'notfound' }
  if (row.revoked_at) return { status: 'revoked' }
  if (row.expires_at && row.expires_at.getTime() <= Date.now()) return { status: 'expired' }

  await prisma.$executeRaw`
    UPDATE share_links SET last_accessed_at = now() WHERE token = ${token}
  `
  return { status: 'ok', storyId: row.story_id, familyId: row.family_id }
}
