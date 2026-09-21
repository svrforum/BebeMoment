import type { PrismaClient, ScheduleChecklistItem } from '@bebe/db-public'
import { z } from 'zod'
import { ServiceError } from '../error'
import { assertCanEditEntry, assertScheduleCan } from './entry'

const AddInput = z.object({
  entryId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
})

const RenameInput = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
})

const IdInput = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

const DoneInput = IdInput.and(z.object({ done: z.boolean() }))

async function loadItem(
  id: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<ScheduleChecklistItem> {
  const item = await prisma.scheduleChecklistItem.findFirst({ where: { id, familyId } })
  if (!item) throw new ServiceError(404, 'schedule.notFound')
  return item
}

export async function addChecklistItem(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleChecklistItem> {
  const input = AddInput.parse(raw)
  await assertCanEditEntry(input.entryId, input.familyId, input.byUserId, prisma)
  const last = await prisma.scheduleChecklistItem.findFirst({
    where: { familyId: input.familyId, entryId: input.entryId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  return prisma.scheduleChecklistItem.create({
    data: {
      familyId: input.familyId,
      entryId: input.entryId,
      label: input.label,
      position: last ? last.position + 1 : 0,
    },
  })
}

export async function renameChecklistItem(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleChecklistItem> {
  const input = RenameInput.parse(raw)
  const item = await loadItem(input.id, input.familyId, prisma)
  await assertCanEditEntry(item.entryId, input.familyId, input.byUserId, prisma)
  const updated = await prisma.scheduleChecklistItem.updateMany({
    where: { id: input.id, familyId: input.familyId },
    data: { label: input.label },
  })
  if (updated.count === 0) throw new ServiceError(404, 'schedule.notFound')
  return loadItem(input.id, input.familyId, prisma)
}

export async function removeChecklistItem(raw: unknown, prisma: PrismaClient): Promise<void> {
  const input = IdInput.parse(raw)
  const item = await loadItem(input.id, input.familyId, prisma)
  await assertCanEditEntry(item.entryId, input.familyId, input.byUserId, prisma)
  await prisma.scheduleChecklistItem.deleteMany({
    where: { id: input.id, familyId: input.familyId },
  })
}

/** 체크는 보기 권한이면 충분하다 — 보이는 사람은 체크할 수 있다. */
export async function setChecklistItemDone(
  raw: unknown,
  prisma: PrismaClient,
): Promise<ScheduleChecklistItem> {
  const input = DoneInput.parse(raw)
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.read', prisma)
  const updated = await prisma.scheduleChecklistItem.updateMany({
    where: { id: input.id, familyId: input.familyId },
    data: input.done
      ? { doneAt: new Date(), doneByUserId: input.byUserId }
      : { doneAt: null, doneByUserId: null },
  })
  if (updated.count === 0) throw new ServiceError(404, 'schedule.notFound')
  return loadItem(input.id, input.familyId, prisma)
}
