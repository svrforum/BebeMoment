import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'

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
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'album.asset.detach', familyCaps)
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
