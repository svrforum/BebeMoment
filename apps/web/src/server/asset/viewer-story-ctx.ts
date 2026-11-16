import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

export type StoryViewerCtx = {
  /** 스토리에서 열었을 때만 — 다른 곳에서 열면 앞뒤 사진이 스토리 순서가 아니다. */
  index: number | null
  total: number | null
  body: string
  publicNo: number
}

/**
 * 상세 뷰어 하단에 보여줄 스토리 본문. 스토리(ctx='story:<entryId>')에서 열렸으면 그 스토리 +
 * 이 사진이 몇 번째인지(index/total, neighborIds 의 스토리 자산 순서로 계산 — 스와이프마다
 * viewer-bundle 이 다시 계산한다). 타임라인·검색 등 다른 곳에서 열렸으면 이 사진이 속한
 * 스토리의 본문만 — 예전엔 스토리 화면에서 열 때만 보여서 타임라인에서 바로 여는 가족에겐
 * 본문이 보이지 않았다.
 */
export async function resolveStoryViewerCtx(
  ctx: string | undefined,
  neighborIds: string[] | undefined,
  currentAssetId: string,
  familyId: string,
  prisma: PrismaPublic,
  // 기본값은 제한적인 'family' — family 면 비밀 스토리 본문이 새지 않도록 가시성 필터를
  // 직접 건다(neighborIds 게이트에만 의존하던 fragile 한 방어를 자체 필터로 강화).
  viewerRole: Role | 'owner' | 'guardian' | 'family' = 'family',
): Promise<StoryViewerCtx | null> {
  const visible = {
    familyId,
    deletedAt: null,
    ...(viewerRole === 'family' ? { visibility: 'family' as const } : {}),
  }
  const select = { body: true, publicNo: true } as const

  const idx = neighborIds?.indexOf(currentAssetId) ?? -1
  if (ctx?.startsWith('story:') && neighborIds && idx >= 0) {
    const story = await prisma.story.findFirst({
      where: { ...visible, id: ctx.slice('story:'.length) },
      select,
    })
    if (story) return { ...story, index: idx + 1, total: neighborIds.length }
  }

  const story = await prisma.story.findFirst({
    where: { ...visible, assets: { some: { assetId: currentAssetId } } },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    select,
  })
  return story ? { ...story, index: null, total: null } : null
}
