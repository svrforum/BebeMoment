import { can } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function softDeleteMilestone(raw: unknown, prisma: PrismaClient): Promise<void> {
  const input = Input.parse(raw)
  const ms = await prisma.milestone.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!ms) {
    throw new Error('Milestone not found')
  }
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const isOwn = ms.createdByUserId === input.byUserId
  const capability = isOwn ? 'record.delete.own' : 'record.delete.any'
  if (!can(membership.role, capability)) throw new Error('No permission to delete this milestone')

  await prisma.milestone.update({
    where: { id: input.id, familyId: input.familyId },
    data: { deletedAt: new Date() },
  })
}
