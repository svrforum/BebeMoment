import type { AssetComment, PrismaClient } from '@bebe/db-public'

export async function listComments(
  familyId: string,
  assetId: string,
  prisma: PrismaClient,
): Promise<
  (AssetComment & {
    author: { id: string; displayName: string; avatarPath: string | null }
  })[]
> {
  const rows = await prisma.assetComment.findMany({
    where: { familyId, assetId },
    include: {
      author: { select: { id: true, displayName: true, avatarPath: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  // 삭제된 댓글은 tombstone("삭제된 댓글이에요")만 렌더하므로 본문·멘션을 클라로 보내지
  // 않는다(삭제된 내용이 페이로드로 새는 것 방지). deletedAt 은 유지해 tombstone 표시.
  return rows.map((c) => (c.deletedAt ? { ...c, body: '', mentionedUserIds: [] } : c))
}
