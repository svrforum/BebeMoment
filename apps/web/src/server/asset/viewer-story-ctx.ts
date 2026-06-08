import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

export type StoryViewerCtx = {
  index: number
  total: number
  body: string
  publicNo: number
}

/**
 * 상세 뷰어가 스토리(ctx='story:<entryId>')에서 열렸을 때, 하단에 보여줄 스토리 본문 +
 * 이 사진이 몇 번째인지(index/total)를 돌려준다. 순번은 neighborIds(스토리 자산 순서)에서
 * 현재 자산 위치로 계산 — 스와이프해도 viewer-bundle 이 매번 다시 계산해 갱신된다.
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
  if (!ctx?.startsWith('story:') || !neighborIds?.length) return null
  const idx = neighborIds.indexOf(currentAssetId)
  if (idx < 0) return null
  const story = await prisma.story.findFirst({
    where: {
      id: ctx.slice('story:'.length),
      familyId,
      deletedAt: null,
      ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
    },
    select: { body: true, publicNo: true },
  })
  if (!story) return null
  return { index: idx + 1, total: neighborIds.length, body: story.body, publicNo: story.publicNo }
}
