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
  if (!album) throw new NotFoundError('앨범을 찾을 수 없어요')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new ForbiddenError('가족 멤버가 아니에요')
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const isOwnAlbum = album.createdByUserId === input.byUserId
  const allowed =
    (isOwnAlbum && resolveCan(membership.role, 'album.update.own', familyCaps)) ||
    resolveCan(membership.role, 'album.update.any', familyCaps)
  if (!allowed) throw new ForbiddenError('이 앨범을 편집할 권한이 없어요')

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
      throw new ConflictError('이 앨범에 속한 사진만 커버로 설정할 수 있어요')
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
      if (!asset) throw new NotFoundError('커버로 쓸 사진이 없어요')
    }
  }

  try {
    const updated = await prismaPublic.album.update({
      where: { id: album.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
      },
    })
    revalidateAlbumsTag(input.familyId)
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('같은 위치에 같은 이름의 앨범이 이미 있어요')
    }
    throw err
  }
}
