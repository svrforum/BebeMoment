import { can } from '@bebe/core'
import type { Milestone, PrismaClient } from '@bebe/db'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  patch: z.object({
    achievedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(500).nullable().optional(),
    assetIds: z.array(z.string().uuid()).max(10).optional(),
  }),
})

export async function updateMilestone(raw: unknown, prisma: PrismaClient): Promise<Milestone> {
  const input = Input.parse(raw)
  const ms = await prisma.milestone.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!ms) throw new Error('Milestone not found')
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const isOwn = ms.createdByUserId === input.byUserId
  if (!can(membership.role, isOwn ? 'record.edit.own' : 'record.edit.any')) {
    throw new Error('No permission to edit this milestone')
  }

  if (input.patch.achievedAt) {
    const d = new Date(`${input.patch.achievedAt}T00:00:00Z`)
    if (d.getTime() > Date.now()) throw new Error('achieved_at cannot be in the future')
  }

  if (input.patch.assetIds && input.patch.assetIds.length > 0) {
    const count = await prisma.asset.count({
      where: {
        id: { in: input.patch.assetIds },
        familyId: input.familyId,
        status: 'ready',
        deletedAt: null,
      },
    })
    if (count !== input.patch.assetIds.length) throw new Error('one or more assets invalid')
  }

  const data: Record<string, unknown> = {}
  if (input.patch.achievedAt) data.achievedAt = new Date(`${input.patch.achievedAt}T00:00:00Z`)
  if (input.patch.note !== undefined) data.note = input.patch.note
  if (input.patch.assetIds !== undefined) {
    data.assets = {
      deleteMany: {},
      create: input.patch.assetIds.map((aid) => ({ assetId: aid })),
    }
  }

  return prisma.milestone.update({
    where: { id: input.id, familyId: input.familyId },
    data,
  })
}
