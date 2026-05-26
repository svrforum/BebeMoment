import { can } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { type EnqueueNotification, enqueueNotification } from '../notifications/enqueue'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * Attach assets to an album. Validates each asset belongs to the family
 * and is not soft-deleted before insert. Skips duplicates so the call is
 * idempotent.
 */
export async function attachAssetsToAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  enqueue: EnqueueNotification = enqueueNotification,
): Promise<{ added: number; total: number }> {
  const input = Input.parse(raw)

  const album = await prismaPublic.album.findFirst({
    where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
    select: { id: true },
  })
  if (!album) throw new Error('album not found')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'album.asset.attach')) {
    throw new Error('No permission')
  }

  const validAssets = await prismaMedia.asset.findMany({
    where: {
      id: { in: input.assetIds },
      familyId: input.familyId,
      deletedAt: null,
    },
    select: { id: true },
  })
  const validIds = validAssets.map((a) => a.id)
  if (validIds.length === 0) {
    revalidateAlbumsTag(input.familyId)
    return { added: 0, total: 0 }
  }

  const result = await prismaPublic.albumAsset.createMany({
    data: validIds.map((assetId) => ({
      albumId: input.albumId,
      assetId,
      familyId: input.familyId,
      addedByUserId: input.byUserId,
    })),
    skipDuplicates: true,
  })

  const total = await prismaPublic.albumAsset.count({
    where: { albumId: input.albumId, familyId: input.familyId },
  })
  revalidateAlbumsTag(input.familyId)

  if (result.count > 0) {
    await enqueue({
      familyId: input.familyId,
      actorUserId: input.byUserId,
      type: 'album.asset_added',
      payload: { albumId: input.albumId },
    })
  }

  return { added: result.count, total }
}
