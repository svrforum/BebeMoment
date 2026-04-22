import { can } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function softDeleteGrowthRecord(raw: unknown, prisma: PrismaClient): Promise<void> {
  const input = Input.parse(raw)
  const rec = await prisma.growthRecord.findUnique({ where: { id: input.id } })
  if (!rec || rec.familyId !== input.familyId || rec.deletedAt) {
    throw new Error('Growth record not found')
  }
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const isOwn = rec.createdByUserId === input.byUserId
  const capability = isOwn ? 'record.delete.own' : 'record.delete.any'
  if (!can(membership.role, capability)) throw new Error('No permission to delete this record')

  await prisma.growthRecord.update({
    where: { id: input.id, familyId: input.familyId },
    data: { deletedAt: new Date() },
  })
}
