import type { PrismaClient, ScheduleReminder } from '@bebe/db-public'
import { z } from 'zod'
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
 * 일정의 알림 집합을 통째로 교체한다. 지워진 알림의 발송 원장은 FK cascade 로 함께 사라지는데,
 * 시각이 다른 알림은 다른 알림이므로 발송 기록이 초기화되는 게 맞다.
 * 중복 spec 은 삽입 전에 걸러낸다 — 유니크 인덱스에 기대면 createMany 가 통째로 실패한다.
 */
export async function setScheduleReminders(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleReminder[]> {
  const input = SetInput.parse(raw)
  await assertCanEditEntry(input.entryId, input.familyId, input.byUserId, prisma)
  const specs = dedupe(input.specs)
  return prisma.$transaction(async (tx) => {
    await tx.scheduleReminder.deleteMany({
      where: { familyId: input.familyId, entryId: input.entryId },
    })
    if (specs.length > 0) {
      await tx.scheduleReminder.createMany({
        data: specs.map((spec) => ({
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
