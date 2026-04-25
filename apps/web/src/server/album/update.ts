import { can } from '@bebe/core'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

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
): Promise<Album> {
  const input = Input.parse(raw)

  const album = await prismaPublic.album.findFirst({
    where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
  })
  if (!album) throw new Error('album not found')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const isOwnAlbum = album.createdByUserId === input.byUserId
  const allowed =
    (isOwnAlbum && can(membership.role, 'album.update.own')) ||
    can(membership.role, 'album.update.any')
  if (!allowed) throw new Error('No permission to edit this album')

  // If renaming, check sibling-name uniqueness.
  if (input.name && input.name !== album.name) {
    const conflict = await prismaPublic.album.findFirst({
      where: {
        familyId: input.familyId,
        parentId: album.parentId,
        name: input.name,
        deletedAt: null,
        id: { not: album.id },
      },
    })
    if (conflict) throw new Error('같은 위치에 같은 이름의 앨범이 이미 있어요')
  }

  return prismaPublic.album.update({
    where: { id: album.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.coverAssetId !== undefined
        ? { coverAssetId: input.coverAssetId }
        : {}),
    },
  })
}
