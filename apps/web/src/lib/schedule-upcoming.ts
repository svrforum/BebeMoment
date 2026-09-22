import type { ScheduleEntryView } from '@/server/schedule/list'

/** 달력에 놓이는 회차 — 날짜 없는 할 일은 여기 들어오지 않는다. */
export type DatedScheduleEntry = ScheduleEntryView & { onDate: string }

export type UpcomingSchedule = {
  /** `past` = 보고 있는 달이 통째로 지나가서 앞으로 올 회차가 하나도 없다는 뜻. */
  kind: 'upcoming' | 'past'
  entries: DatedScheduleEntry[]
}

/** 종일이 그날 맨 앞 — 서버 목록(`listScheduleMonth`)과 같은 규칙이라야 순서가 흔들리지 않는다. */
function byDayThenTime(a: DatedScheduleEntry, b: DatedScheduleEntry): number {
  if (a.onDate !== b.onDate) return a.onDate < b.onDate ? -1 : 1
  return (a.startMinute ?? -1) - (b.startMinute ?? -1)
}

/**
 * 달력 밑에 붙일 짧은 목록. 한 달치 회차에서 **오늘 이후**를 가까운 순으로 고른다.
 *
 * 지난 달을 펼쳐 보는 중이면 앞으로 올 게 없다 — 그렇다고 빈 칸을 보여 주면 그 달에 뭐가
 * 있었는지 알 길이 없으므로, 그 달의 마지막 회차들을 대신 준다(`kind: 'past'`).
 */
export function upcomingSchedule(
  entries: ScheduleEntryView[],
  todayKey: string,
  limit: number,
): UpcomingSchedule {
  const dated = entries
    .filter((e): e is DatedScheduleEntry => e.onDate !== null)
    .sort(byDayThenTime)
  if (dated.length === 0) return { kind: 'upcoming', entries: [] }
  const ahead = dated.filter((e) => e.onDate >= todayKey)
  if (ahead.length > 0) return { kind: 'upcoming', entries: ahead.slice(0, limit) }
  return { kind: 'past', entries: dated.slice(Math.max(0, dated.length - limit)) }
}
