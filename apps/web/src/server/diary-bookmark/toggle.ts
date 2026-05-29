import { can } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  entryId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function toggleDiaryBookmark(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ bookmarked: boolean }> {
  const input = Input.parse(raw)

  const entry = await prismaPublic.journalEntry.findFirst({
    where: { id: input.entryId, familyId: input.familyId, deletedAt: null },
  })
  if (!entry) throw new Error('entry not found in this family')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'social.react')) {
    throw new Error('No permission: not a member of this family')
  }

  // guardians-only entry: family role cannot interact (would expose existence)
  if (entry.visibility === 'guardians' && membership.role === 'family') {
    throw new Error('entry not found in this family')
  }

  const existing = await prismaPublic.journalBookmark.findFirst({
    where: { entryId: input.entryId, userId: input.byUserId, familyId: input.familyId },
  })

  if (existing) {
    await prismaPublic.journalBookmark.deleteMany({
      where: { entryId: input.entryId, userId: input.byUserId, familyId: input.familyId },
    })
    return { bookmarked: false }
  }
  await prismaPublic.journalBookmark.create({
    data: { entryId: input.entryId, userId: input.byUserId, familyId: input.familyId },
  })
  return { bookmarked: true }
}
