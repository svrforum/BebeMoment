import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError } from '../error'
import { findVisibleAlbumOrThrow } from './secret-visibility'

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
  if (!membership || membership.deletedAt) throw new ForbiddenError('album.memberOnly')
  const familyCaps = await getFamilyCapabilities(prismaPublic)

  return prismaPublic
    .$transaction(async (tx) => {
      const album = await findVisibleAlbumOrThrow(
        { albumId: input.albumId, familyId: input.familyId, viewerRole: membership.role },
        tx,
      )

      const allowed =
        (album.createdByUserId === input.byUserId &&
          resolveCan(membership.role, 'album.delete.own', familyCaps)) ||
        resolveCan(membership.role, 'album.delete.any', familyCaps)
      if (!allowed) throw new ForbiddenError('album.deleteDenied')

      // cascade 는 하위 전체를 지운다. family 가 자기 앨범을 지우며 그 아래 보호자가 숨겨 둔
      // 비밀 앨범까지 쓸어 가지 않게 막는다 — 아래 개수 안내도 숨긴 앨범을 세게 된다.
      if (membership.role === 'family') {
        const secretBelow = await tx.album.count({
          where: {
            familyId: input.familyId,
            path: { startsWith: `${album.path}/` },
            secret: true,
            deletedAt: null,
          },
        })
        if (secretBelow > 0) throw new ForbiddenError('album.deleteDenied')
      }

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
