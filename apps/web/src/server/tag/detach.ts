import { can } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  assetId: z.string().uuid(),
  tagId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function detachTagFromAsset(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ ok: boolean }> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (
    !membership ||
    membership.deletedAt ||
    !can(membership.role, 'asset.tag.detach')
  ) {
    throw new Error('No permission')
  }

  await prismaPublic.assetTag.deleteMany({
    where: {
      assetId: input.assetId,
      tagId: input.tagId,
      familyId: input.familyId,
    },
  })
  return { ok: true }
}
