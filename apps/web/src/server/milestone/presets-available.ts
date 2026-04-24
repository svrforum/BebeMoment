import { MILESTONE_PRESETS, type MilestonePreset } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'

export async function presetsAvailable(
  familyId: string,
  babyId: string,
  prisma: PrismaClient,
): Promise<(MilestonePreset & { taken: boolean })[]> {
  const taken = await prisma.milestone.findMany({
    where: { familyId, babyId, deletedAt: null, presetKey: { not: null } },
    select: { presetKey: true },
  })
  const takenKeys = new Set(taken.map((t) => t.presetKey as string))
  return MILESTONE_PRESETS.map((p) => ({ ...p, taken: takenKeys.has(p.key) }))
}
