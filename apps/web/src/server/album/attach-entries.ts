import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ForbiddenError, NotFoundError } from '../error'
import { isAlbumSecretForViewer } from './secret-visibility'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * Attach diary entries (stories) to an album. Mirrors attachAssetsToAlbum:
 * validates each entry belongs to the family and isn't deleted, idempotent
 * via skipDuplicates. Reuses the `album.asset.attach` capability ("add to
 * album").
 */
export async function attachEntriesToAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ added: number; total: number }> {
  const input = Input.parse(raw)

  const album = await prismaPublic.album.findFirst({
    where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
    select: { id: true },
  })
  if (!album) throw new NotFoundError('album.notFound')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'album.asset.attach', familyCaps)
  ) {
    throw new ForbiddenError('album.permissionDenied')
  }
  if (
    await isAlbumSecretForViewer(
      { albumId: input.albumId, familyId: input.familyId, viewerRole: membership.role },
      prismaPublic,
    )
  ) {
    throw new NotFoundError('album.notFound')
  }

  const valid = await prismaPublic.story.findMany({
    where: { id: { in: input.entryIds }, familyId: input.familyId, deletedAt: null },
    select: { id: true },
  })
  const validIds = valid.map((e) => e.id)
  if (validIds.length === 0) {
    revalidateAlbumsTag(input.familyId)
    return { added: 0, total: 0 }
  }

  const result = await prismaPublic.albumStory.createMany({
    data: validIds.map((storyId) => ({
      albumId: input.albumId,
      storyId,
      familyId: input.familyId,
      addedByUserId: input.byUserId,
    })),
    skipDuplicates: true,
  })

  const total = await prismaPublic.albumStory.count({
    where: { albumId: input.albumId, familyId: input.familyId },
  })
  revalidateAlbumsTag(input.familyId)

  return { added: result.count, total }
}
