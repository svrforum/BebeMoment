import type { Asset, Baby, JournalEntry, JournalEntryAsset, PrismaClient } from '@bebe/db'

export async function getJournalEntry(
  id: string,
  familyId: string,
  prisma: PrismaClient,
): Promise<
  | (JournalEntry & {
      assets: (JournalEntryAsset & { asset: Asset })[]
      baby: Baby | null
    })
  | null
> {
  return prisma.journalEntry.findFirst({
    where: { id, familyId, deletedAt: null },
    include: { assets: { include: { asset: true } }, baby: true },
  })
}
