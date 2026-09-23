import { normalizeTemplateItems } from '@/lib/checklist-template-merge'
import type { PrismaClient, ScheduleChecklistTemplate } from '@bebe/db-public'
import { z } from 'zod'
import { ServiceError } from '../error'
import { assertScheduleCan } from './entry'

export type ChecklistTemplateView = Pick<ScheduleChecklistTemplate, 'id' | 'name' | 'items'>

const MAX_ITEMS = 50

const SaveInput = z.object({
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
  items: z.array(z.string().max(200)).max(MAX_ITEMS * 2),
})

/** 템플릿은 가족이 함께 쓰는 준비물 목록이다 — 보호자면 누가 만들었든 보고 쓰고 지운다. */
export async function listChecklistTemplates(
  input: { familyId: string; byUserId: string },
  prisma: PrismaClient,
): Promise<ChecklistTemplateView[]> {
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.read', prisma)
  return prisma.scheduleChecklistTemplate.findMany({
    where: { familyId: input.familyId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, items: true },
  })
}

/** 같은 이름이 있으면 그 템플릿의 항목을 바꾼다(replaced=true). */
export async function saveChecklistTemplate(
  raw: unknown,
  prisma: PrismaClient,
): Promise<{ template: ChecklistTemplateView; replaced: boolean }> {
  const input = SaveInput.parse(raw)
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.create', prisma)
  const items = normalizeTemplateItems(input.items).slice(0, MAX_ITEMS)
  if (items.length === 0) throw new ServiceError(400, 'schedule.templateEmpty')

  const existing = await prisma.scheduleChecklistTemplate.findFirst({
    where: { familyId: input.familyId, name: input.name },
    select: { id: true },
  })
  const template = await prisma.scheduleChecklistTemplate.upsert({
    where: { familyId_name: { familyId: input.familyId, name: input.name } },
    create: { familyId: input.familyId, name: input.name, items, createdByUserId: input.byUserId },
    update: { items },
    select: { id: true, name: true, items: true },
  })
  return { template, replaced: existing !== null }
}

export async function deleteChecklistTemplate(
  input: { id: string; familyId: string; byUserId: string },
  prisma: PrismaClient,
): Promise<void> {
  await assertScheduleCan(input.familyId, input.byUserId, 'schedule.create', prisma)
  const res = await prisma.scheduleChecklistTemplate.deleteMany({
    where: { id: input.id, familyId: input.familyId },
  })
  if (res.count === 0) throw new ServiceError(404, 'schedule.templateNotFound')
}
