import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import { isAlbumSecretForViewer } from './secret-visibility'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ForbiddenError, NotFoundError } from '../error'
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
  if (!album) throw new NotFoundError('album.notFound')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'album.asset.attach', familyCaps)
  ) {
    throw new ForbiddenError('album.permissionDenied')
  }
  // family 역할에겐 비밀(또는 조상-secret) 앨범을 읽기 경로처럼 가린다 — 존재 비노출을
  // 위해 read 와 동일한 'album not found' 로 거부(§21).
  if (
    await isAlbumSecretForViewer(
      { albumId: input.albumId, familyId: input.familyId, viewerRole: membership.role },
      prismaPublic,
    )
  ) {
    throw new NotFoundError('album.notFound')
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
