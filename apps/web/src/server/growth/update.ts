import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { GrowthRecord, PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const Patch = z.object({
  measuredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  heightCm: z.number().positive().max(200).nullable().optional(),
  weightKg: z.number().positive().max(50).nullable().optional(),
  headCm: z.number().positive().max(80).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  patch: Patch,
})

export async function updateGrowthRecord(
  raw: unknown,
  prisma: PrismaClient,
): Promise<GrowthRecord> {
  const input = Input.parse(raw)

  const rec = await prisma.growthRecord.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!rec) {
    throw new Error('Growth record not found')
  }

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) {
    throw new Error('No permission: not a member')
  }

  const familyCaps = await getFamilyCapabilities(prisma)
  const isOwn = rec.createdByUserId === input.byUserId
  const capability = isOwn ? 'record.edit.own' : 'record.edit.any'
  if (!resolveCan(membership.role, capability, familyCaps)) {
    throw new Error('No permission to edit this record')
  }

  if (input.patch.measuredAt) {
    const d = new Date(`${input.patch.measuredAt}T00:00:00Z`)
    if (d.getTime() > Date.now()) throw new Error('measured_at cannot be in the future')
  }

  const data: Record<string, unknown> = {}
  if (input.patch.measuredAt !== undefined)
    data.measuredAt = new Date(`${input.patch.measuredAt}T00:00:00Z`)
  for (const k of ['heightCm', 'weightKg', 'headCm', 'note'] as const) {
    if (input.patch[k] !== undefined) data[k] = input.patch[k]
  }

  return prisma.growthRecord.update({
    where: { id: input.id, familyId: input.familyId },
    data,
  })
}
