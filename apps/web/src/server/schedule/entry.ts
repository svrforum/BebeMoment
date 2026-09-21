import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { type Capability, resolveCan } from '@bebe/core'
import type { PrismaClient, ScheduleEntry } from '@bebe/db-public'
import { z } from 'zod'
import { ServiceError } from '../error'

const DAY = /^\d{4}-\d{2}-\d{2}$/

const Shape = z
  .object({
    title: z.string().trim().min(1).max(200),
    memo: z.string().max(2000).nullable().optional(),
    onDate: z.string().regex(DAY).nullable().optional(),
    startMinute: z.number().int().min(0).max(1439).nullable().optional(),
    repeatYearly: z.boolean().optional(),
    repeatUntil: z.string().regex(DAY).nullable().optional(),
    babyId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.startMinute == null || v.onDate != null, {
    message: 'errors.schedule.timeNeedsDate',
  })
  .refine((v) => !v.repeatYearly || v.onDate != null, {
    message: 'errors.schedule.repeatNeedsDate',
  })
  .refine((v) => v.repeatUntil == null || v.repeatYearly === true, {
    message: 'errors.schedule.repeatUntilNeedsRepeat',
  })

const CreateInput = z
  .object({ familyId: z.string().uuid(), byUserId: z.string().uuid() })
  .and(Shape)

export async function assertScheduleCan(
  familyId: string,
  userId: string,
  capability: Capability,
  prisma: PrismaClient,
): Promise<string> {
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId, userId } },
  })
  const caps = await getFamilyCapabilities(prisma)
  if (!membership || membership.deletedAt || !resolveCan(membership.role, capability, caps)) {
    throw new ServiceError(403, 'schedule.forbidden')
  }
  return membership.role
}

function dateOrNull(day: string | null | undefined): Date | null {
  return day ? new Date(`${day}T00:00:00.000Z`) : null
}

/**
 * 아기 id 는 클라이언트가 보낸 값이라 가족 경계를 넘을 수 있다. FK 는 babies(id) 만 보고
 * family_id 는 보지 않으므로 여기서 막지 않으면 남의 가족 아기가 붙는다(§8). 없는 id 는
 * FK 위반으로 터지는데, 그건 사용자에게 아무 말도 못 해 주는 실패라 미리 걸러 낸다.
 */
async function assertBabyInFamily(
  babyId: string | null,
  familyId: string,
  prisma: PrismaClient,
): Promise<void> {
  if (!babyId) return
  const baby = await prisma.baby.findFirst({
    where: { id: babyId, familyId, deletedAt: null },
    select: { id: true },
  })
  if (!baby) throw new ServiceError(400, 'schedule.babyNotFound')
}

export async function createScheduleEntry(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  const input = CreateInput.parse(raw)
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.create', prisma)
  await assertBabyInFamily(input.babyId ?? null, input.familyId, prisma)
  return prisma.scheduleEntry.create({
    data: {
      familyId: input.familyId,
      babyId: input.babyId ?? null,
      title: input.title,
      memo: input.memo ?? null,
      onDate: dateOrNull(input.onDate),
      startMinute: input.startMinute ?? null,
      repeatYearly: input.repeatYearly ?? false,
      repeatUntil: dateOrNull(input.repeatUntil),
      createdByUserId: input.byUserId,
    },
  })
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  patch: Shape,
})

/** 작성자면 .own, 남의 것이면 .any 를 요구한다. */
async function loadOwned(
  id: string,
  familyId: string,
  userId: string,
  own: Capability,
  any: Capability,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  const entry = await prisma.scheduleEntry.findFirst({
    where: { id, familyId, deletedAt: null },
  })
  if (!entry) throw new ServiceError(404, 'schedule.notFound')
  await assertScheduleCan(familyId, userId, entry.createdByUserId === userId ? own : any, prisma)
  return entry
}

/** 체크리스트 서비스가 그대로 쓴다. */
export async function assertCanEditEntry(
  entryId: string,
  familyId: string,
  userId: string,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  return loadOwned(entryId, familyId, userId, 'schedule.edit.own', 'schedule.edit.any', prisma)
}

async function reload(id: string, familyId: string, prisma: PrismaClient): Promise<ScheduleEntry> {
  const row = await prisma.scheduleEntry.findFirst({ where: { id, familyId } })
  if (!row) throw new ServiceError(404, 'schedule.notFound')
  return row
}

export async function updateScheduleEntry(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  const input = UpdateInput.parse(raw)
  const before = await assertCanEditEntry(input.id, input.familyId, input.byUserId, prisma)
  const p = input.patch
  await assertBabyInFamily(p.babyId ?? null, input.familyId, prisma)
  const onDate = dateOrNull(p.onDate)
  const startMinute = p.startMinute ?? null
  const updated = await prisma.scheduleEntry.updateMany({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
    data: {
      title: p.title,
      memo: p.memo ?? null,
      onDate,
      startMinute,
      repeatYearly: p.repeatYearly ?? false,
      repeatUntil: dateOrNull(p.repeatUntil),
      babyId: p.babyId ?? null,
    },
  })
  if (updated.count === 0) throw new ServiceError(404, 'schedule.notFound')
  const moved = before.onDate?.getTime() !== onDate?.getTime() || before.startMinute !== startMinute
  if (moved) {
    // 회차 키는 시작 날짜뿐이라, 같은 날 안에서 시간만 옮기면 이미 보낸 기록이 새 시각까지
    // 덮어 버린다 — 그러면 미룬 일정은 영영 안 울린다. 시각이 움직였으면 기록을 비운다.
    await clearReminderFires(input.id, input.familyId, prisma)
  }
  if (onDate === null) {
    // 날짜가 사라지면 울릴 회차도 사라진다. 알림 행을 남겨 두면 화면에는 걸려 있는데 발송
    // 경로는 그 일정을 건너뛴다(조용한 실패 금지). 원장은 cascade 로 함께 사라진다.
    await prisma.scheduleReminder.deleteMany({
      where: { familyId: input.familyId, entryId: input.id },
    })
  }
  return reload(input.id, input.familyId, prisma)
}

async function clearReminderFires(
  entryId: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.scheduleReminderFire.deleteMany({
    where: { familyId, reminder: { entryId } },
  })
}

const IdInput = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function deleteScheduleEntry(raw: unknown, prisma: PrismaClient): Promise<void> {
  const input = IdInput.parse(raw)
  await loadOwned(
    input.id,
    input.familyId,
    input.byUserId,
    'schedule.delete.own',
    'schedule.delete.any',
    prisma,
  )
  await prisma.scheduleEntry.updateMany({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
}

const DoneInput = IdInput.and(z.object({ done: z.boolean() }))

/** 완료 토글은 보기 권한이면 충분하다 — 보이는 사람은 체크할 수 있다. */
export async function setScheduleEntryDone(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  const input = DoneInput.parse(raw)
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.read', prisma)
  const updated = await prisma.scheduleEntry.updateMany({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
    data: input.done
      ? { doneAt: new Date(), doneByUserId: input.byUserId }
      : { doneAt: null, doneByUserId: null },
  })
  if (updated.count === 0) throw new ServiceError(404, 'schedule.notFound')
  return reload(input.id, input.familyId, prisma)
}
