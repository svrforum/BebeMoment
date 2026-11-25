import type { Milestone, PrismaClient as PrismaPublic } from '@bebe/db-public'

/**
 * 아기의 달성한 마일스톤(최근 것부터). 붙은 사진은 싣지 않는다 — 체크리스트는 이름·날짜만
 * 쓰는데, 사진을 읽어 서명하면 비밀 스토리 사진 필터 없이 서명 URL 이 만들어진다. 사진을 보여
 * 줄 화면이 생기면 viewerRole 을 받아 hiddenAssetIdsForViewer 로 거른 뒤 싣는다.
 */
export async function listMilestonesByBaby(
  familyId: string,
  babyId: string,
  prismaPublic: PrismaPublic,
): Promise<Milestone[]> {
  return prismaPublic.milestone.findMany({
    where: { familyId, babyId, deletedAt: null },
    orderBy: [{ achievedAt: 'desc' }, { createdAt: 'desc' }],
  })
}
