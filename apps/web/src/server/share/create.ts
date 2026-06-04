import type { PrismaClient } from '@bebe/db-public'
import { type ShareTtl, expiryFromTtl, generateShareToken } from './token'

/**
 * 스토리 공유 링크 발급. 매 호출마다 새 난수 토큰을 만든다(기존 링크 재사용 안 함 — 사용자가
 * 그때그때 새 링크를 만들고 개별 해제할 수 있게). family-공개 스토리만 — guardians 전용은
 * 공개 프리뷰가 비어 공유 의미가 없어 차단한다.
 */
export async function createShareLink(
  input: { storyId: string; familyId: string; userId: string; ttl: ShareTtl },
  prisma: PrismaClient,
): Promise<{ token: string; expiresAt: Date | null }> {
  const story = await prisma.story.findFirst({
    where: { id: input.storyId, familyId: input.familyId, deletedAt: null },
    select: { id: true, visibility: true },
  })
  if (!story) throw new Error('스토리를 찾을 수 없어요')
  if (story.visibility !== 'family')
    throw new Error('가족 전체 공개 스토리만 공유 링크를 만들 수 있어요')

  const token = generateShareToken()
  const expiresAt = expiryFromTtl(input.ttl, new Date())
  await prisma.shareLink.create({
    data: {
      token,
      storyId: input.storyId,
      familyId: input.familyId,
      createdByUserId: input.userId,
      expiresAt,
    },
  })
  return { token, expiresAt }
}
