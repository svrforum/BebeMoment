import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'
import { isUniqueViolation } from '../prisma-errors'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(80)
    .refine((s) => !s.includes('/'))
    .optional(),
  description: z.string().max(500).nullable().optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
  secret: z.boolean().optional(),
})

export async function updateAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia?: PrismaMedia,
): Promise<Album> {
  const input = Input.parse(raw)

  const album = await prismaPublic.album.findFirst({
    where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
  })
  if (!album) throw new NotFoundError('album.notFound')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new ForbiddenError('album.memberOnly')
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const isOwnAlbum = album.createdByUserId === input.byUserId
  const allowed =
    (isOwnAlbum && resolveCan(membership.role, 'album.update.own', familyCaps)) ||
    resolveCan(membership.role, 'album.update.any', familyCaps)
  if (!allowed) throw new ForbiddenError('album.editDenied')

  // 비밀 여부는 부모(owner/guardian)만 바꿀 수 있다.
  if (input.secret !== undefined && membership.role === 'family') {
    throw new ForbiddenError('album.secretToggleGuardianOnly')
  }

  // Cover asset must (a) exist in the same family, (b) be ready, (c) be
  // attached to *this* album. Otherwise a malicious or buggy client could
  // set cover_asset_id to any uuid — including across families.
  if (input.coverAssetId !== undefined && input.coverAssetId !== null) {
    const attached = await prismaPublic.albumAsset.findFirst({
      where: {
        albumId: album.id,
        assetId: input.coverAssetId,
        familyId: input.familyId,
      },
    })
    if (!attached) {
      throw new ConflictError('album.coverMustBelong')
    }
    if (prismaMedia) {
      const asset = await prismaMedia.asset.findFirst({
        where: {
          id: input.coverAssetId,
          familyId: input.familyId,
          status: 'ready',
          deletedAt: null,
        },
        select: { id: true },
      })
      if (!asset) throw new NotFoundError('album.coverNotFound')
    }
  }

  try {
    const updated = await prismaPublic.album.update({
      where: { id: album.id, familyId: input.familyId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
        ...(input.secret !== undefined ? { secret: input.secret } : {}),
      },
    })
    revalidateAlbumsTag(input.familyId)
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('album.duplicateName')
    }
    throw err
  }
}
