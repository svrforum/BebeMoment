import type { PrismaClient } from '@bebe/db-public'

/**
 * 로그인 전 공개 페이지에 싣는 일정 정보. 메모·체크리스트·알림은 여기에 **필드조차 없다** —
 * 메모에 병원 기록 같은 것이 적히는 기능이라, 공개 경로가 실수로라도 그것을 들고 나가지 못하게
 * 조회 단계에서 고르지 않는다. 전체 내용은 로그인한 보호자가 일정 상세에서만 본다.
 */
export type PublicSchedulePreview = {
  familyName: string
  entryId: string
  title: string
  /** 'YYYY-MM-DD'. 날짜 없는 할 일이면 null. */
  onDate: string | null
  /** 0-1439. 종일이면 null. */
  startMinute: number | null
}

export async function getPublicSchedulePreview(
  entryId: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<PublicSchedulePreview | null> {
  const entry = await prisma.scheduleEntry.findFirst({
    where: { id: entryId, familyId, deletedAt: null },
    select: { id: true, title: true, onDate: true, startMinute: true },
  })
  if (!entry) return null
  const family = await prisma.family.findFirst({
    where: { id: familyId },
    select: { name: true },
  })
  if (!family) return null
  return {
    familyName: family.name,
    entryId: entry.id,
    title: entry.title,
    onDate: entry.onDate ? entry.onDate.toISOString().slice(0, 10) : null,
    startMinute: entry.startMinute,
  }
}
