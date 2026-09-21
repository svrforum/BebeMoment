import type { PrismaClient, ScheduleReminder } from '@bebe/db-public'
import { z } from 'zod'
import { ServiceError } from '../error'
import { assertCanEditEntry } from './entry'
import type { ReminderSpec } from './reminder-time'

const SpecInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lead'), leadMinutes: z.number().int().min(0).max(43200) }),
  z.object({
    kind: z.literal('dayBefore'),
    daysBefore: z.number().int().min(0).max(30),
    atMinute: z.number().int().min(0).max(1439),
  }),
])

const SetInput = z.object({
  entryId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  specs: z.array(SpecInput).max(20),
})

function specKey(spec: ReminderSpec): string {
  return spec.kind === 'lead'
    ? `lead:${spec.leadMinutes}`
    : `day:${spec.daysBefore}:${spec.atMinute}`
}

/** 저장된 행의 같은 키 — 유니크 인덱스가 이 셋을 알림의 정체로 취급한다. */
function rowKey(row: Pick<ScheduleReminder, 'leadMinutes' | 'daysBefore' | 'atMinute'>): string {
  return row.leadMinutes !== null
    ? `lead:${row.leadMinutes}`
    : `day:${row.daysBefore}:${row.atMinute}`
}

function dedupe(specs: ReminderSpec[]): ReminderSpec[] {
  const seen = new Set<string>()
  return specs.filter((spec) => {
    const key = specKey(spec)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 일정의 알림 집합을 요청한 모양으로 맞춘다. 폼이 목록 전체를 보내지만 **바뀐 것만** 건드린다 —
 * 행을 지우면 발송 원장이 FK cascade 로 함께 사라지므로, 통째로 지우고 다시 만들면 메모 한 줄
 * 고친 저장이 이미 보낸 알림의 기록까지 지워 같은 알림이 한 번 더 간다. 사라진 spec 만 지우고
 * 그대로인 알림은 id 를 지켜 기록을 유지한다(시각이 다른 알림은 다른 알림이므로 그건 초기화가 맞다).
 * 중복 spec 은 삽입 전에 걸러낸다 — 유니크 인덱스에 기대면 createMany 가 통째로 실패한다.
 */
export async function setScheduleReminders(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleReminder[]> {
  const input = SetInput.parse(raw)
  const entry = await assertCanEditEntry(input.entryId, input.familyId, input.byUserId, prisma)
  const specs = dedupe(input.specs)
  // 날짜 없는 일정에는 울릴 회차가 없다. 그냥 저장하면 화면에는 알림이 보이는데 발송 경로는
  // 그 일정을 영영 건너뛴다 — 고장 난 걸 아무도 모르는 상태가 된다.
  if (specs.length > 0 && !entry.onDate) {
    throw new ServiceError(400, 'schedule.reminderNeedsDate')
  }
  const wanted = new Map(specs.map((spec) => [specKey(spec), spec]))
  return prisma.$transaction(async (tx) => {
    const existing = await tx.scheduleReminder.findMany({
      where: { familyId: input.familyId, entryId: input.entryId },
    })
    const staleIds = existing.filter((row) => !wanted.has(rowKey(row))).map((row) => row.id)
    if (staleIds.length > 0) {
      await tx.scheduleReminder.deleteMany({
        where: { familyId: input.familyId, id: { in: staleIds } },
      })
    }
    const kept = new Set(
      existing.filter((row) => wanted.has(rowKey(row))).map((row) => rowKey(row)),
    )
    const added = specs.filter((spec) => !kept.has(specKey(spec)))
    if (added.length > 0) {
      await tx.scheduleReminder.createMany({
        data: added.map((spec) => ({
          familyId: input.familyId,
          entryId: input.entryId,
          leadMinutes: spec.kind === 'lead' ? spec.leadMinutes : null,
          daysBefore: spec.kind === 'dayBefore' ? spec.daysBefore : null,
          atMinute: spec.kind === 'dayBefore' ? spec.atMinute : null,
        })),
      })
    }
    return tx.scheduleReminder.findMany({
      where: { familyId: input.familyId, entryId: input.entryId },
      orderBy: [{ leadMinutes: 'asc' }, { daysBefore: 'asc' }, { atMinute: 'asc' }],
    })
  })
}
