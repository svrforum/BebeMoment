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

export type ShareLinkKind = 'story' | 'asset' | 'album' | 'date' | 'selection'

export type ShareLinkAdminInfo = ShareLinkInfo & {
  kind: ShareLinkKind
  target: string
  createdByName: string | null
}

function classifyTarget(row: {
  storyId: string | null
  assetId: string | null
  albumId: string | null
  targetDate: Date | null
}): { kind: ShareLinkKind; target: string } {
  if (row.storyId) return { kind: 'story', target: row.storyId }
  if (row.assetId) return { kind: 'asset', target: row.assetId }
  if (row.albumId) return { kind: 'album', target: row.albumId }
  if (row.targetDate) return { kind: 'date', target: row.targetDate.toISOString().slice(0, 10) }
  return { kind: 'selection', target: '' }
}

// 가족이 발행한 **살아있는** 공유 링크(관리자 전수 점검·일괄 회수용). 타깃별 조회만
// 가능하던 갭을 메운다 — owner 가 가족 전체에 어떤 공개 링크가 떠 있는지 한눈에 보고 회수한다.
// 만료된 링크는 이미 접근 불가(resolve.ts 가 거름)라 회수할 필요가 없으므로 목록에서 제외한다.
export async function listAllShareLinks(
  familyId: string,
  prisma: PrismaClient,
): Promise<ShareLinkAdminInfo[]> {
  const rows = await prisma.shareLink.findMany({
    where: {
      familyId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      token: true,
      storyId: true,
      assetId: true,
      albumId: true,
      targetDate: true,
      createdByUserId: true,
      expiresAt: true,
      createdAt: true,
      lastAccessedAt: true,
    },
  })
  const userIds = Array.from(new Set(rows.map((r) => r.createdByUserId)))
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : []
  const nameById = new Map(users.map((u) => [u.id, u.displayName]))
  const now = Date.now()
  return rows.map((r) => ({
    token: r.token,
    ...classifyTarget(r),
    createdByName: nameById.get(r.createdByUserId) ?? null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    lastAccessedAt: r.lastAccessedAt,
    expired: r.expiresAt !== null && r.expiresAt.getTime() <= now,
  }))
}

// 현재 사용자가 발행한 살아있는 공유 링크(선택 링크 포함). 선택(컬렉션) 링크는 안정적인
// 타깃 식별자가 없어 per-target 관리 경로(listShareLinks)로는 보이지 않던 갭을 메운다 —
// 본인이 만든 링크를 직접 찾아 회수할 수 있게 한다(회수는 토큰 기준 DELETE).
export async function listMyShareLinks(
  familyId: string,
  userId: string,
  prisma: PrismaClient,
): Promise<ShareLinkAdminInfo[]> {
  const rows = await prisma.shareLink.findMany({
    where: {
      familyId,
      createdByUserId: userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      token: true,
      storyId: true,
      assetId: true,
      albumId: true,
      targetDate: true,
      createdByUserId: true,
      expiresAt: true,
      createdAt: true,
      lastAccessedAt: true,
    },
  })
  const now = Date.now()
  return rows.map((r) => ({
    token: r.token,
    ...classifyTarget(r),
    createdByName: null,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    lastAccessedAt: r.lastAccessedAt,
    expired: r.expiresAt !== null && r.expiresAt.getTime() <= now,
  }))
}

// 가족의 모든 활성 공유 링크 일괄 회수. 회수 수 반환.
export async function revokeAllShareLinks(familyId: string, prisma: PrismaClient): Promise<number> {
  const res = await prisma.shareLink.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return res.count
}
