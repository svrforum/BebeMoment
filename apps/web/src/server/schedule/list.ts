import type { PrismaClient } from '@bebe/db-public'
import { occurrenceDatesInRange } from './reminder-time'

export type ScheduleDaySummary = { day: string; total: number; remaining: number }

export type ScheduleEntryView = {
  id: string
  title: string
  /** 그 회차의 날짜(`YYYY-MM-DD`). 날짜 없는 할 일이면 null. */
  onDate: string | null
  startMinute: number | null
  doneAt: Date | null
  checklistTotal: number
  checklistDone: number
  reminderCount: number
}

export type ScheduleChecklistItemView = {
  id: string
  label: string
  position: number
  doneAt: Date | null
  doneByUserId: string | null
  /** 체크한 사람의 표시 이름. 두 사람이 나눠 챙기는 목록이라 이게 목록의 절반이다. */
  doneByName: string | null
}

export type ScheduleReminderView = {
  id: string
  leadMinutes: number | null
  daysBefore: number | null
  atMinute: number | null
}

export type ScheduleEntryDetail = ScheduleEntryView & {
  memo: string | null
  repeatYearly: boolean
  repeatUntil: string | null
  babyId: string | null
  createdByUserId: string
  doneByUserId: string | null
  checklistItems: ScheduleChecklistItemView[]
  reminders: ScheduleReminderView[]
}

/**
 * `@db.Date` 는 자정 UTC 로 저장된다. 사진 버킷(`takenAt`)·타임라인의 `?date=` 와 같은 UTC
 * 일자 기준이어야 같은 칸에 놓이므로 로컬 게터를 쓰지 않는다.
 */
function dayKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

type LoadedEntry = {
  id: string
  title: string
  onDate: Date | null
  startMinute: number | null
  doneAt: Date | null
  repeatYearly: boolean
  repeatUntil: Date | null
  createdAt: Date
  checklistItems: { doneAt: Date | null }[]
  _count: { reminders: number }
}

const LIST_INCLUDE = {
  checklistItems: { select: { doneAt: true } },
  _count: { select: { reminders: true } },
} as const

function viewOf(row: LoadedEntry, onDate: string | null): ScheduleEntryView {
  return {
    id: row.id,
    title: row.title,
    onDate,
    startMinute: row.startMinute,
    doneAt: row.doneAt,
    checklistTotal: row.checklistItems.length,
    checklistDone: row.checklistItems.filter((i) => i.doneAt !== null).length,
    reminderCount: row._count.reminders,
  }
}

/** 종일(시각 없음)이 그날 맨 앞이다. Postgres 의 ASC 는 NULL 을 뒤로 보내므로 여기서 정렬한다. */
function byDayThenTime(
  a: { day: string; row: LoadedEntry },
  b: { day: string; row: LoadedEntry },
): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  const am = a.row.startMinute ?? -1
  const bm = b.row.startMinute ?? -1
  if (am !== bm) return am - bm
  return a.row.createdAt.getTime() - b.row.createdAt.getTime()
}

function occurrencesOf(row: LoadedEntry, fromDate: string, toDate: string): string[] {
  if (!row.onDate) return []
  return occurrenceDatesInRange(
    {
      onDate: dayKeyUtc(row.onDate),
      repeatYearly: row.repeatYearly,
      repeatUntil: row.repeatUntil ? dayKeyUtc(row.repeatUntil) : null,
    },
    fromDate,
    toDate,
  )
}

/**
 * 한 달치 일정. **`month` 는 캘린더 화면과 같은 0-based** 다 — 페이지가 URL 의 달을 그대로
 * 넘긴다. 매년 반복은 그 달의 회차로 전개해 넣고, 날짜 없는 할 일은 달력에 싣지 않는다.
 */
export async function listScheduleMonth(
  args: { familyId: string; year: number; month: number },
  prisma: PrismaClient,
): Promise<{ days: ScheduleDaySummary[]; entries: ScheduleEntryView[] }> {
  const { familyId, year, month } = args
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  const fromDate = dayKeyUtc(first)
  const toDate = dayKeyUtc(last)

  const rows = await prisma.scheduleEntry.findMany({
    where: {
      familyId,
      deletedAt: null,
      // 매년 반복은 시작 연도가 한참 전이라 날짜 범위로 못 거른다 — 전개는 아래에서.
      OR: [{ onDate: { gte: first, lte: last } }, { repeatYearly: true }],
    },
    include: LIST_INCLUDE,
  })

  const occurrences = rows.flatMap((row) =>
    occurrencesOf(row, fromDate, toDate).map((day) => ({ day, row })),
  )
  occurrences.sort(byDayThenTime)

  const days: ScheduleDaySummary[] = []
  const byDay = new Map<string, ScheduleDaySummary>()
  for (const { day, row } of occurrences) {
    let summary = byDay.get(day)
    if (!summary) {
      summary = { day, total: 0, remaining: 0 }
      byDay.set(day, summary)
      days.push(summary)
    }
    summary.total += 1
    if (!row.doneAt) summary.remaining += 1
  }

  return { days, entries: occurrences.map(({ day, row }) => viewOf(row, day)) }
}

/** 매년 반복은 오늘 이후의 첫 회차가 제자리다 — 시작 연도에 묶어 두면 영원히 '지난' 칸에 앉는다. */
function todoDayOf(row: LoadedEntry, todayKey: string): string | null {
  if (!row.onDate) return null
  const stored = dayKeyUtc(row.onDate)
  if (!row.repeatYearly) return stored
  const horizon = `${Number(todayKey.slice(0, 4)) + 2}${todayKey.slice(4)}`
  return occurrencesOf(row, todayKey, horizon)[0] ?? stored
}

export async function listScheduleTodos(
  args: { familyId: string; todayKey: string },
  prisma: PrismaClient,
): Promise<{
  overdue: ScheduleEntryView[]
  today: ScheduleEntryView[]
  upcoming: ScheduleEntryView[]
  undated: ScheduleEntryView[]
  done: ScheduleEntryView[]
}> {
  const rows = await prisma.scheduleEntry.findMany({
    where: { familyId: args.familyId, deletedAt: null },
    include: LIST_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })

  const dated: { day: string; row: LoadedEntry }[] = []
  const undated: ScheduleEntryView[] = []
  const finished: LoadedEntry[] = []
  for (const row of rows) {
    if (row.doneAt) {
      finished.push(row)
      continue
    }
    const day = todoDayOf(row, args.todayKey)
    if (day === null) undated.push(viewOf(row, null))
    else dated.push({ day, row })
  }
  dated.sort(byDayThenTime)
  finished.sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))

  const pick = (keep: (day: string) => boolean) =>
    dated.filter(({ day }) => keep(day)).map(({ day, row }) => viewOf(row, day))

  return {
    overdue: pick((day) => day < args.todayKey),
    today: pick((day) => day === args.todayKey),
    upcoming: pick((day) => day > args.todayKey),
    undated,
    done: finished.map((row) => viewOf(row, row.onDate ? dayKeyUtc(row.onDate) : null)),
  }
}

export async function getScheduleEntry(
  args: { id: string; familyId: string },
  prisma: PrismaClient,
): Promise<ScheduleEntryDetail | null> {
  const row = await prisma.scheduleEntry.findFirst({
    where: { id: args.id, familyId: args.familyId, deletedAt: null },
    include: {
      checklistItems: {
        orderBy: { position: 'asc' },
        // 이름은 같은 왕복에 실어 온다 — 항목마다 사용자를 따로 읽으면 N+1 이다.
        select: {
          id: true,
          label: true,
          position: true,
          doneAt: true,
          doneByUserId: true,
          doneBy: { select: { displayName: true } },
        },
      },
      reminders: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, leadMinutes: true, daysBefore: true, atMinute: true },
      },
    },
  })
  if (!row) return null
  return {
    ...viewOf(
      { ...row, checklistItems: row.checklistItems, _count: { reminders: row.reminders.length } },
      row.onDate ? dayKeyUtc(row.onDate) : null,
    ),
    memo: row.memo,
    repeatYearly: row.repeatYearly,
    repeatUntil: row.repeatUntil ? dayKeyUtc(row.repeatUntil) : null,
    babyId: row.babyId,
    createdByUserId: row.createdByUserId,
    doneByUserId: row.doneByUserId,
    checklistItems: row.checklistItems.map(({ doneBy, ...item }) => ({
      ...item,
      doneByName: doneBy?.displayName ?? null,
    })),
    reminders: row.reminders,
  }
}
