import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { isValidPresetKey, resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Milestone, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { type EnqueueNotification, enqueueNotification } from '../notifications/enqueue'

const Input = z
  .object({
    familyId: z.string().uuid(),
    babyId: z.string().uuid(),
    presetKey: z.string().optional(),
    customLabel: z.string().min(1).max(40).optional(),
    achievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500).optional(),
    assetIds: z.array(z.string().uuid()).max(10).optional(),
    byUserId: z.string().uuid(),
  })
  .refine((v) => !!v.presetKey !== !!v.customLabel, {
    message: 'exactly one of presetKey or customLabel is required',
  })

export async function createMilestone(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  enqueue: EnqueueNotification = enqueueNotification,
): Promise<Milestone> {
  const input = Input.parse(raw)

  if (input.presetKey && !isValidPresetKey(input.presetKey)) {
    throw new Error(`unknown preset key: ${input.presetKey}`)
  }

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!membership || membership.deletedAt || !resolveCan(membership.role, 'record.create', familyCaps)) {
    throw new Error('No permission')
  }

  const baby = await prismaPublic.baby.findFirst({
    where: { id: input.babyId, familyId: input.familyId, deletedAt: null },
  })
  if (!baby) {
    throw new Error('baby does not belong to this family')
  }

  const achieved = new Date(`${input.achievedAt}T00:00:00Z`)
  if (achieved.getTime() > Date.now()) throw new Error('achieved_at cannot be in the future')

  if (input.assetIds && input.assetIds.length > 0) {
    const count = await prismaMedia.asset.count({
      where: {
        id: { in: input.assetIds },
        familyId: input.familyId,
        status: 'ready',
        deletedAt: null,
      },
    })
    if (count !== input.assetIds.length) {
      throw new Error('one or more assets not found or not ready in this family')
    }
  }

  let milestone: Milestone
  try {
    milestone = await prismaPublic.milestone.create({
      data: {
        familyId: input.familyId,
        babyId: input.babyId,
        ...(input.presetKey ? { presetKey: input.presetKey } : {}),
        ...(input.customLabel ? { customLabel: input.customLabel } : {}),
        achievedAt: achieved,
        ...(input.note !== undefined ? { note: input.note } : {}),
        createdByUserId: input.byUserId,
        ...(input.assetIds && input.assetIds.length > 0
          ? { assets: { create: input.assetIds.map((aid) => ({ assetId: aid })) } }
          : {}),
      },
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new Error('이미 기록된 마일스톤이에요')
    }
    throw e
  }

  await enqueue({
    familyId: input.familyId,
    actorUserId: input.byUserId,
    type: 'milestone.created',
    payload: { milestoneId: milestone.id, babyId: input.babyId },
  })

  return milestone
}
