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

export async function createScheduleEntry(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleEntry> {
  const input = CreateInput.parse(raw)
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.create', prisma)
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
  await assertCanEditEntry(input.id, input.familyId, input.byUserId, prisma)
  const p = input.patch
  const updated = await prisma.scheduleEntry.updateMany({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
    data: {
      title: p.title,
      memo: p.memo ?? null,
      onDate: dateOrNull(p.onDate),
      startMinute: p.startMinute ?? null,
      repeatYearly: p.repeatYearly ?? false,
      repeatUntil: dateOrNull(p.repeatUntil),
      babyId: p.babyId ?? null,
    },
  })
  if (updated.count === 0) throw new ServiceError(404, 'schedule.notFound')
  return reload(input.id, input.familyId, prisma)
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
