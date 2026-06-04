import type { PrismaClient } from '@bebe/db-public'

export type ShareLinkInfo = {
  token: string
  expiresAt: Date | null
  createdAt: Date
  lastAccessedAt: Date | null
  expired: boolean
}

// 한 스토리의 해제 안 된 공유 링크 목록(관리 UI). 만료된 것도 보여주되 expired 플래그로 구분.
export async function listShareLinks(
  storyId: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<ShareLinkInfo[]> {
  const rows = await prisma.shareLink.findMany({
    where: { storyId, familyId, revokedAt: null },
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
