import type { PrismaClient as PrismaMedia } from '@bebe/db-media'

// 'YYYY-MM-DD' 날짜의 가족 사진 id(타임라인과 같은 takenAt UTC-day 버킷, 오래된→최신 순).
// takenAt = wall-clock-as-UTC 라 [date 00:00Z, +1d) 로 끊으면 타임라인 일자 그룹과 일치한다.
export async function getDateAssetIds(
  date: string,
  familyId: string,
  prismaMedia: PrismaMedia,
  // 공유 링크 생성 시점. 주면 그 시점에 이미 존재하던 자산만 포함한다 — 날짜 공유가
  // 발급 후 올라온 같은 날 사진까지 자동 노출(동의 없는 과다노출)하지 않게 고정.
  createdBefore?: Date,
): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const rows = await prismaMedia.asset.findMany({
    where: {
      familyId,
      status: 'ready',
      deletedAt: null,
      takenAt: { gte: start, lt: end },
      ...(createdBefore ? { createdAt: { lte: createdBefore } } : {}),
    },
    orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
