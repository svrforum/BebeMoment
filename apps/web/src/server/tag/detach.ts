import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateTagsTag } from '../cache-tags'

const Input = z.object({
  assetId: z.string().uuid(),
  tagId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function detachTagFromAsset(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ removed: number }> {
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
    !resolveCan(membership.role, 'asset.tag.detach', familyCaps)
  ) {
    throw new Error('No permission')
  }

  // Returning the actual deleted count (instead of always {ok: true}) lets
  // the API distinguish "removed" from "wasn't there" — useful for the
  // optimistic UI rollback path.
  const result = await prismaPublic.assetTag.deleteMany({
    where: {
      assetId: input.assetId,
      tagId: input.tagId,
      familyId: input.familyId,
    },
  })
  revalidateTagsTag(input.familyId)
  return { removed: result.count }
}
