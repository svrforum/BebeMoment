import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  id: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function softDeleteDiaryEntry(raw: unknown, prisma: PrismaClient): Promise<void> {
  const input = Input.parse(raw)
  const entry = await prisma.journalEntry.findFirst({
    where: { id: input.id, familyId: input.familyId, deletedAt: null },
  })
  if (!entry) {
    throw new Error('Entry not found')
  }
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const familyCaps = await getFamilyCapabilities(prisma)
  const isOwn = entry.createdByUserId === input.byUserId
  const capability = isOwn ? 'record.delete.own' : 'record.delete.any'
  if (!resolveCan(membership.role, capability, familyCaps))
    throw new Error('No permission to delete this entry')

  await prisma.journalEntry.update({
    where: { id: input.id, familyId: input.familyId },
    data: { deletedAt: new Date() },
  })
}
