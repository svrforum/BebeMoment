import type { PrismaClient } from '@bebe/db-public'
import type { ShareTarget } from './create'

export type ShareResolution =
  | { status: 'ok'; target: ShareTarget; familyId: string }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'notfound' }

/**
 * 공개 공유 라우트(/s/<token>)용 토큰 해석. 세션/familyId 없는 무인증 라우트라 tenant
 * 미들웨어를 raw 쿼리로 우회한다(§8, isRegistrationOpen 패턴). 만료·해제 상태를 구분.
 * 단일 컬럼이 모두 null 이면 선택(컬렉션) — share_link_assets 에서 자산 id 를 순서대로 읽는다.
 * 유효하면 last_accessed_at 갱신(best-effort).
 */
export async function resolveShareLink(
  token: string,
  prisma: PrismaClient,
): Promise<ShareResolution> {
  if (!token || token.length > 200) return { status: 'notfound' }
  const rows = await prisma.$queryRaw<
    {
      story_id: string | null
      asset_id: string | null
      album_id: string | null
      target_date: Date | null
      family_id: string
      expires_at: Date | null
      revoked_at: Date | null
    }[]
  >`
    SELECT story_id, asset_id, album_id, target_date, family_id, expires_at, revoked_at
    FROM share_links WHERE token = ${token} LIMIT 1
  `
  const row = rows[0]
  if (!row) return { status: 'notfound' }
  if (row.revoked_at) return { status: 'revoked' }
  if (row.expires_at && row.expires_at.getTime() <= Date.now()) return { status: 'expired' }

  await prisma.$executeRaw`
    UPDATE share_links SET last_accessed_at = now() WHERE token = ${token}
  `

  let target: ShareTarget
  if (row.story_id) target = { kind: 'story', storyId: row.story_id }
  else if (row.asset_id) target = { kind: 'asset', assetId: row.asset_id }
  else if (row.album_id) target = { kind: 'album', albumId: row.album_id }
  else if (row.target_date)
    target = { kind: 'date', date: row.target_date.toISOString().slice(0, 10) }
  else {
    const assetRows = await prisma.$queryRaw<{ asset_id: string }[]>`
      SELECT asset_id FROM share_link_assets WHERE token = ${token} ORDER BY sort_index ASC
    `
    target = { kind: 'selection', assetIds: assetRows.map((a) => a.asset_id) }
  }
  return { status: 'ok', target, familyId: row.family_id }
}
