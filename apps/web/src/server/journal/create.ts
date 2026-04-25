import { can } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { JournalEntry, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const MOODS = ['happy', 'grateful', 'tired', 'sad', 'proud', 'calm'] as const

const VISIBILITIES = ['family', 'guardians'] as const

const Input = z.object({
  familyId: z.string().uuid(),
  babyId: z.string().uuid().nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(20000),
  mood: z.enum(MOODS).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  assetIds: z.array(z.string().uuid()).max(10).optional(),
  byUserId: z.string().uuid(),
})

export async function createJournalEntry(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<JournalEntry> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'record.create')) {
    throw new Error('No permission')
  }

  if (input.babyId) {
    const baby = await prismaPublic.baby.findFirst({
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
    // Status check is intentionally relaxed: composer-style flows attach
    // photos that may still be `uploading` / `processing` — that's fine,
    // the entry references them by id and the timeline will pick up the
    // final urls once status flips to `ready`.
    const count = await prismaMedia.asset.count({
      where: {
        id: { in: input.assetIds },
        familyId: input.familyId,
        deletedAt: null,
      },
    })
    if (count !== input.assetIds.length) throw new Error('one or more assets invalid')
  }

  return prismaPublic.journalEntry.create({
    data: {
      familyId: input.familyId,
      babyId: input.babyId,
      entryDate,
      ...(input.title !== undefined ? { title: input.title } : {}),
      body: input.body,
      ...(input.mood !== undefined ? { mood: input.mood } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
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
