/**
 * 워커 전용. 여기의 조회는 한 가족이 아니라 **인스턴스의 모든 가족**을 훑는다 —
 * 요청 경로(라우트·서버 액션)에서 쓰지 말 것. 가족 id 는 먼저 열거해 `familyId in (...)`
 * 로 걸어 tenant 확장의 스코프 규칙을 지킨다(§8).
 */
import type { PrismaClient } from '@bebe/db-public'
import {
  type ReminderSpec,
  occurrenceDatesInRange,
  reminderWallClock,
  wallClockToInstant,
} from './reminder-time'

export const REMINDER_LOOKBACK_MS = 60 * 60 * 1000
export const REMINDER_SKIP_MARK_MS = 24 * 60 * 60 * 1000

/** 알림의 최대 선행(30일)보다 하루 넉넉하게. */
const WINDOW_DAYS = 31
const DAY_MS = 24 * 60 * 60 * 1000

export type DueReminder = {
  reminderId: string
  entryId: string
  familyId: string
  occurrenceOn: string
  title: string
  fireAt: Date
}

export type FireState = 'sent' | 'skipped_past'

function dayKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

/** on_date 는 벽시계 날짜라 UTC 자정으로 저장·비교한다(§2.5). */
function utcMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

function localDayKey(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`
}

function specOf(row: {
  leadMinutes: number | null
  daysBefore: number | null
  atMinute: number | null
}): ReminderSpec | null {
  if (row.leadMinutes !== null) return { kind: 'lead', leadMinutes: row.leadMinutes }
  if (row.daysBefore !== null && row.atMinute !== null) {
    return { kind: 'dayBefore', daysBefore: row.daysBefore, atMinute: row.atMinute }
  }
  return null
}

async function allFamilyIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM families`
  return rows.map((r) => r.id)
}

export async function findDueReminders(
  now: Date,
  prisma: PrismaClient,
): Promise<{ due: DueReminder[]; skipped: DueReminder[] }> {
  const familyIds = await allFamilyIds(prisma)
  if (familyIds.length === 0) return { due: [], skipped: [] }

  const fromDate = localDayKey(new Date(now.getTime() - WINDOW_DAYS * DAY_MS))
  const toDate = localDayKey(new Date(now.getTime() + WINDOW_DAYS * DAY_MS))

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      familyId: { in: familyIds },
      deletedAt: null,
      doneAt: null,
      OR: [
        { onDate: { gte: utcMidnight(fromDate), lte: utcMidnight(toDate) } },
        { repeatYearly: true },
      ],
    },
    include: { reminders: true },
  })

  const due: DueReminder[] = []
  const skipped: DueReminder[] = []

  for (const entry of entries) {
    if (!entry.onDate || entry.reminders.length === 0) continue
    const occurrences = occurrenceDatesInRange(
      {
        onDate: dayKeyUtc(entry.onDate),
        repeatYearly: entry.repeatYearly,
        repeatUntil: entry.repeatUntil ? dayKeyUtc(entry.repeatUntil) : null,
      },
      fromDate,
      toDate,
    )
    for (const reminder of entry.reminders) {
      const spec = specOf(reminder)
      if (!spec) continue
      for (const occurrenceOn of occurrences) {
        const fireAt = wallClockToInstant(reminderWallClock(occurrenceOn, entry.startMinute, spec))
        const elapsed = now.getTime() - fireAt.getTime()
        if (elapsed < 0 || elapsed > REMINDER_SKIP_MARK_MS) continue
        const hit: DueReminder = {
          reminderId: reminder.id,
          entryId: entry.id,
          familyId: entry.familyId,
          occurrenceOn,
          title: entry.title,
          fireAt,
        }
        if (elapsed <= REMINDER_LOOKBACK_MS) due.push(hit)
        else skipped.push(hit)
      }
    }
  }

  const candidates = [...due, ...skipped]
  if (candidates.length === 0) return { due, skipped }

  const fired = await prisma.scheduleReminderFire.findMany({
    where: {
      familyId: { in: familyIds },
      reminderId: { in: [...new Set(candidates.map((c) => c.reminderId))] },
    },
    select: { reminderId: true, occurrenceOn: true },
  })
  const claimed = new Set(fired.map((f) => `${f.reminderId}:${dayKeyUtc(f.occurrenceOn)}`))
  const unclaimed = (r: DueReminder) => !claimed.has(`${r.reminderId}:${r.occurrenceOn}`)

  return { due: due.filter(unclaimed), skipped: skipped.filter(unclaimed) }
}

/**
 * 보내기 **전에** 원장 행을 선점한다. true 일 때만 발송한다 — false 는 다른 틱이나
 * 재시작 전의 자신이 이미 보냈다는 뜻이다(§1.4).
 */
export async function claimReminderFire(
  r: DueReminder,
  state: FireState,
  prisma: PrismaClient,
): Promise<boolean> {
  const inserted = await prisma.$executeRaw`
    INSERT INTO public.schedule_reminder_fires (reminder_id, occurrence_on, family_id, state)
    VALUES (${r.reminderId}::uuid, ${r.occurrenceOn}::date, ${r.familyId}::uuid, ${state})
    ON CONFLICT DO NOTHING`
  return inserted > 0
}
