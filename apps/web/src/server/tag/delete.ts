import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateTagsTag } from '../cache-tags'

const Input = z.object({
  tagId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

/**
 * Soft-delete a tag. Cascades to asset_tags via FK in the Prisma schema
 * (ON DELETE CASCADE) — but we soft-delete first so undo is possible.
 *
 * For now: hard-delete asset_tags rows associated with this tag at the same
 * time, since the tag will no longer be visible anywhere. Soft-delete on the
 * tag itself preserves the slug + name for audit until the retention job
 * cleans up.
 */
export async function deleteTag(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ removedAttachments: number }> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'tag.delete', familyCaps)
  ) {
    throw new Error('No permission: cannot delete tags')
  }

  const tag = await prismaPublic.tag.findFirst({
    where: { id: input.tagId, familyId: input.familyId, deletedAt: null },
  })
  if (!tag) throw new Error('tag not found')

  const [_, attachments] = await prismaPublic.$transaction([
    prismaPublic.tag.update({
      where: { id: tag.id },
      data: { deletedAt: new Date() },
    }),
    prismaPublic.assetTag.deleteMany({
      where: { tagId: tag.id, familyId: input.familyId },
    }),
  ])
  revalidateTagsTag(input.familyId)
  return { removedAttachments: attachments.count }
}
