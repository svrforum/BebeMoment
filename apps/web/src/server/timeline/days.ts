import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import { type TimelineSort, timelineAssetWhere } from './merged-list'

export type TimelineDay = { key: string; count: number }

const utcDayKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`

/**
 * 날짜 스크러버의 트랙 — 타임라인 그리드에 섹션이 생기는 날(축의 UTC 일자)과 그날 사진 수,
 * 최신순. 그리드와 같은 조건(`timelineAssetWhere`)·같은 일자 규칙(build-groups)이어야
 * 눈금과 섹션이 맞는다. 날짜만 읽으므로 수천 장이어도 가볍다.
 */
export async function listTimelineDays(
  familyId: string,
  params: { sort: TimelineSort; viewerRole: 'owner' | 'guardian' | 'family' },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<TimelineDay[]> {
  const hidden = await hiddenAssetIdsForViewer(params.viewerRole, prismaPublic, familyId)
  const rows = await prismaMedia.asset.findMany({
    where: timelineAssetWhere(familyId, hidden),
    select: { takenAt: true, createdAt: true },
    orderBy: params.sort === 'uploaded' ? { createdAt: 'desc' } : { takenAt: 'desc' },
  })
  const days: TimelineDay[] = []
  for (const r of rows) {
    const key = utcDayKey(params.sort === 'uploaded' ? r.createdAt : r.takenAt)
    const last = days[days.length - 1]
    if (last && last.key === key) last.count += 1
    else days.push({ key, count: 1 })
  }
  return days
}
