import type { PrismaClient as PrismaMedia } from '@bebe/db-media'

// 'YYYY-MM-DD' 날짜의 가족 사진 id(타임라인과 같은 takenAt UTC-day 버킷, 오래된→최신 순).
// takenAt = wall-clock-as-UTC 라 [date 00:00Z, +1d) 로 끊으면 타임라인 일자 그룹과 일치한다.
// 해석 시점 기준(동적) — 링크를 만든 뒤 같은 날에 올린 사진도 포함된다. 발급자에겐 시트
// 안내 문구로 알린다(social.share.copy.date.intro).
export async function getDateAssetIds(
  date: string,
  familyId: string,
  prismaMedia: PrismaMedia,
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
    },
    orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  return rows.map((r) => r.id)
}
