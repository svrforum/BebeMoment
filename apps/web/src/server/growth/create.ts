import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { GrowthRecord, PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { type EnqueueNotification, enqueueNotification } from '../notifications/enqueue'

const Input = z
  .object({
    familyId: z.string().uuid(),
    babyId: z.string().uuid(),
    measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    heightCm: z.number().positive().max(200).optional(),
    weightKg: z.number().positive().max(50).optional(),
    headCm: z.number().positive().max(80).optional(),
    note: z.string().max(500).optional(),
    byUserId: z.string().uuid(),
  })
  .refine((v) => v.heightCm != null || v.weightKg != null || v.headCm != null, {
    message: 'at least one measurement (heightCm / weightKg / headCm) is required',
  })

export async function createGrowthRecord(
  raw: unknown,
  prisma: PrismaClient,
  enqueue: EnqueueNotification = enqueueNotification,
): Promise<GrowthRecord> {
  const input = Input.parse(raw)

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prisma)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'record.create', familyCaps)
  ) {
    throw new Error('No permission: user is not a member of this family')
  }

  const baby = await prisma.baby.findFirst({
    where: { id: input.babyId, familyId: input.familyId, deletedAt: null },
  })
  if (!baby) {
    throw new Error('baby does not belong to this family')
  }

  const measured = new Date(`${input.measuredAt}T00:00:00Z`)
  if (measured.getTime() > Date.now()) {
    throw new Error('measured_at cannot be in the future')
  }

  const record = await prisma.growthRecord.create({
    data: {
      familyId: input.familyId,
      babyId: input.babyId,
      measuredAt: measured,
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
      ...(input.headCm !== undefined ? { headCm: input.headCm } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      createdByUserId: input.byUserId,
    },
  })

  await enqueue({
    familyId: input.familyId,
    actorUserId: input.byUserId,
    type: 'growth.created',
    payload: { recordId: record.id, babyId: input.babyId, visibility: 'guardians' },
  })

  return record
}
