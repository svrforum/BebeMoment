import { can } from '@bebe/core'
import type { JournalEntry, PrismaClient } from '@bebe/db'
import { z } from 'zod'

const MOODS = ['happy', 'grateful', 'tired', 'sad', 'proud', 'calm'] as const

const Input = z.object({
  familyId: z.string().uuid(),
  babyId: z.string().uuid().nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(20000),
  mood: z.enum(MOODS).optional(),
  assetIds: z.array(z.string().uuid()).max(10).optional(),
  byUserId: z.string().uuid(),
})

export async function createJournalEntry(
  raw: unknown,
  prisma: PrismaClient,
): Promise<JournalEntry> {
  const input = Input.parse(raw)

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'record.create')) {
    throw new Error('No permission')
  }

  if (input.babyId) {
    const baby = await prisma.baby.findFirst({
      where: { id: input.babyId, familyId: input.familyId, deletedAt: null },
    })
    if (!baby) {
      throw new Error('baby does not belong to this family')
    }
  }

  const entryDate = new Date(`${input.entryDate}T00:00:00Z`)
  if (entryDate.getTime() > Date.now() + 86400_000) {
    throw new Error('entry_date cannot be in the future')
  }

  if (input.assetIds && input.assetIds.length > 0) {
    const count = await prisma.asset.count({
      where: {
        id: { in: input.assetIds },
        familyId: input.familyId,
        status: 'ready',
        deletedAt: null,
      },
    })
    if (count !== input.assetIds.length) throw new Error('one or more assets invalid')
  }

  return prisma.journalEntry.create({
    data: {
      familyId: input.familyId,
      babyId: input.babyId,
      entryDate,
      ...(input.title !== undefined ? { title: input.title } : {}),
      body: input.body,
      ...(input.mood !== undefined ? { mood: input.mood } : {}),
      createdByUserId: input.byUserId,
      ...(input.assetIds && input.assetIds.length > 0
        ? {
            assets: {
              create: input.assetIds.map((aid, idx) => ({ assetId: aid, order: idx })),
            },
          }
        : {}),
    },
  })
}
