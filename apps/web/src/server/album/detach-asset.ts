import { can } from '@bebe/core'
import { revalidateAlbumsTag } from '../cache-tags'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  albumId: z.string().uuid(),
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function detachAssetFromAlbum(
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
    !can(membership.role, 'album.asset.detach')
  ) {
    throw new Error('No permission')
  }

  await prismaPublic.albumAsset.deleteMany({
    where: {
      albumId: input.albumId,
      assetId: input.assetId,
      familyId: input.familyId,
    },
  })
  revalidateAlbumsTag(input.familyId)
  return { ok: true }
}
