import { can } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  cascade: z.boolean().optional(),
})

/**
 * Soft-delete an album. Children + asset attachments stay attached for the
 * 30-day undo window (retention job — out of scope here).
 *
 * If the album has children or photos, the caller must opt in with
 * `cascade: true`; otherwise we 409-style refuse so the UI can prompt.
 */
export async function deleteAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ removedAlbums: number; removedAttachments: number }> {
  const input = Input.parse(raw)

  const album = await prismaPublic.album.findFirst({
    where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
  })
  if (!album) throw new Error('album not found')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')
  const allowed =
    (album.createdByUserId === input.byUserId &&
      can(membership.role, 'album.delete.own')) ||
    can(membership.role, 'album.delete.any')
  if (!allowed) throw new Error('No permission to delete this album')

  // How many descendants + attachments are involved.
  const [childCount, attachmentCount] = await Promise.all([
    prismaPublic.album.count({
      where: {
        familyId: input.familyId,
        path: { startsWith: `${album.path}/` },
        deletedAt: null,
      },
    }),
    prismaPublic.albumAsset.count({
      where: {
        familyId: input.familyId,
        album: {
          OR: [
            { id: album.id },
            { path: { startsWith: `${album.path}/` } },
          ],
        },
      },
    }),
  ])

  if ((childCount > 0 || attachmentCount > 0) && !input.cascade) {
    throw new Error(
      `앨범에 ${childCount}개 하위 앨범, ${attachmentCount}장 사진이 있어요. cascade 가 필요해요.`,
    )
  }

  const now = new Date()
  await prismaPublic.album.updateMany({
    where: {
      familyId: input.familyId,
      OR: [
        { id: album.id },
        { path: { startsWith: `${album.path}/` } },
      ],
      deletedAt: null,
    },
    data: { deletedAt: now },
  })

  return { removedAlbums: 1 + childCount, removedAttachments: attachmentCount }
}
