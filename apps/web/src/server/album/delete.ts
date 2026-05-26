import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'

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
 *
 * Wrapped in a transaction so the child-count check and the soft-delete
 * happen atomically — concurrent attaches can't sneak in between.
 */
export async function deleteAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<{ removedAlbums: number; removedAttachments: number }> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt) throw new ForbiddenError('가족 멤버가 아니에요')
  const familyCaps = await getFamilyCapabilities(prismaPublic)

  return prismaPublic
    .$transaction(async (tx) => {
      const album = await tx.album.findFirst({
        where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
      })
      if (!album) throw new NotFoundError('앨범을 찾을 수 없어요')

      const allowed =
        (album.createdByUserId === input.byUserId &&
          resolveCan(membership.role, 'album.delete.own', familyCaps)) ||
        resolveCan(membership.role, 'album.delete.any', familyCaps)
      if (!allowed) throw new ForbiddenError('이 앨범을 삭제할 권한이 없어요')

      const [childCount, attachmentCount] = await Promise.all([
        tx.album.count({
          where: {
            familyId: input.familyId,
            path: { startsWith: `${album.path}/` },
            deletedAt: null,
          },
        }),
        tx.albumAsset.count({
          where: {
            familyId: input.familyId,
            album: {
              OR: [{ id: album.id }, { path: { startsWith: `${album.path}/` } }],
            },
          },
        }),
      ])

      if ((childCount > 0 || attachmentCount > 0) && !input.cascade) {
        throw new ConflictError(
          `앨범에 ${childCount}개 하위 앨범, ${attachmentCount}장 사진이 있어요. cascade 가 필요해요.`,
        )
      }

      const now = new Date()
      await tx.album.updateMany({
        where: {
          familyId: input.familyId,
          OR: [{ id: album.id }, { path: { startsWith: `${album.path}/` } }],
          deletedAt: null,
        },
        data: { deletedAt: now },
      })

      return { removedAlbums: 1 + childCount, removedAttachments: attachmentCount }
    })
    .then((r) => {
      revalidateAlbumsTag(input.familyId)
      return r
    })
}
