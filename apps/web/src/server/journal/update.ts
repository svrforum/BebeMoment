import { can } from '@bebe/core'
import type { JournalEntry, PrismaClient } from '@bebe/db'
import { z } from 'zod'

const MOODS = ['happy', 'grateful', 'tired', 'sad', 'proud', 'calm'] as const

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  patch: z.object({
    babyId: z.string().uuid().nullable().optional(),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    title: z.string().max(120).nullable().optional(),
    body: z.string().min(1).max(20000).optional(),
    mood: z.enum(MOODS).nullable().optional(),
    assetIds: z.array(z.string().uuid()).max(10).optional(),
  }),
})

export async function updateJournalEntry(
  raw: unknown,
  prisma: PrismaClient,
): Promise<JournalEntry> {
  const input = Input.parse(raw)
  const entry = await prisma.journalEntry.findUnique({ where: { id: input.id } })
  if (!entry || entry.familyId !== input.familyId || entry.deletedAt) {
    throw new Error('Entry not found')
  }
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const isOwn = entry.createdByUserId === input.byUserId
  if (!can(membership.role, isOwn ? 'record.edit.own' : 'record.edit.any')) {
    throw new Error('No permission to edit this entry')
  }
  if (input.patch.babyId) {
    const baby = await prisma.baby.findUnique({ where: { id: input.patch.babyId } })
    if (!baby || baby.familyId !== input.familyId || baby.deletedAt) {
      throw new Error('baby does not belong to this family')
    }
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
  if (input.patch.babyId !== undefined) data.babyId = input.patch.babyId
  if (input.patch.entryDate) data.entryDate = new Date(`${input.patch.entryDate}T00:00:00Z`)
  if (input.patch.title !== undefined) data.title = input.patch.title
  if (input.patch.body !== undefined) data.body = input.patch.body
  if (input.patch.mood !== undefined) data.mood = input.patch.mood
  if (input.patch.assetIds !== undefined) {
    data.assets = {
      deleteMany: {},
      create: input.patch.assetIds.map((aid, idx) => ({ assetId: aid, order: idx })),
    }
  }
  return prisma.journalEntry.update({
    where: { id: input.id, familyId: input.familyId },
    data,
  })
}
