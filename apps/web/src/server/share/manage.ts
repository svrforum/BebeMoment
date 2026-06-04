import type { PrismaClient } from '@bebe/db-public'
import type { ShareTarget } from './create'

export type ShareLinkInfo = {
  token: string
  expiresAt: Date | null
  createdAt: Date
  lastAccessedAt: Date | null
  expired: boolean
}

// 한 타깃(스토리/사진)의 해제 안 된 공유 링크 목록(관리 UI). 만료된 것도 보여주되 expired 로 구분.
export async function listShareLinks(
  target: ShareTarget,
  familyId: string,
  prisma: PrismaClient,
): Promise<ShareLinkInfo[]> {
  // 선택(컬렉션)은 안정적 식별자가 없어 기존 링크 목록을 만들 수 없다 — 빈 목록.
  if (target.kind === 'selection') return []
  const where =
    target.kind === 'story'
      ? { storyId: target.storyId, familyId, revokedAt: null }
      : target.kind === 'asset'
        ? { assetId: target.assetId, familyId, revokedAt: null }
        : target.kind === 'album'
          ? { albumId: target.albumId, familyId, revokedAt: null }
          : { targetDate: new Date(`${target.date}T00:00:00.000Z`), familyId, revokedAt: null }
  const rows = await prisma.shareLink.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { token: true, expiresAt: true, createdAt: true, lastAccessedAt: true },
  })
  const now = Date.now()
  return rows.map((r) => ({
    ...r,
    expired: r.expiresAt !== null && r.expiresAt.getTime() <= now,
  }))
}

// 링크 해제. familyId 스코프(tenant)로 다른 가족 토큰은 못 건드린다. 이미 해제됐으면 멱등.
export async function revokeShareLink(
  token: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const res = await prisma.shareLink.updateMany({
    where: { token, familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return res.count > 0
}
