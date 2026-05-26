import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateTagsTag } from '../cache-tags'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  tagIds: z.array(z.string().uuid()).min(1).max(20),
})

/**
 * Attach one or more tags to an asset. Skips tags already attached
 * (no-op idempotency for the autocomplete + create flow).
 *
 * Returns count of newly-added rows.
 */
export async function attachTagsToAsset(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<{ added: number; total: number }> {
  const input = Input.parse(raw)

  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
    select: { id: true },
  })
  if (!asset) throw new Error('asset not found in this family')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'asset.tag.attach', familyCaps)
  ) {
    throw new Error('No permission: cannot tag assets')
  }

  // Ensure every tag belongs to this family — guards against attaching
  // someone else's tag id (admins can't accidentally cross families either).
  const tags = await prismaPublic.tag.findMany({
    where: {
      id: { in: input.tagIds },
      familyId: input.familyId,
      deletedAt: null,
    },
    select: { id: true },
  })
  const validTagIds = new Set(tags.map((t) => t.id))
  const toAdd = input.tagIds.filter((id) => validTagIds.has(id))

  if (toAdd.length === 0) {
    const total = await prismaPublic.assetTag.count({
      where: { assetId: input.assetId, familyId: input.familyId },
    })
    revalidateTagsTag(input.familyId)
    return { added: 0, total }
  }

  const result = await prismaPublic.assetTag.createMany({
    data: toAdd.map((tagId) => ({
      assetId: input.assetId,
      tagId,
      familyId: input.familyId,
      addedByUserId: input.byUserId,
    })),
    skipDuplicates: true,
  })

  const total = await prismaPublic.assetTag.count({
    where: { assetId: input.assetId, familyId: input.familyId },
  })
  revalidateTagsTag(input.familyId)
  return { added: result.count, total }
}
