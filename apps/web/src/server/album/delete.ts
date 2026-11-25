import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError } from '../error'
import { findVisibleAlbumOrThrow, hasSecretDescendant } from './secret-visibility'

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
  // family 화면에서 비밀 스토리 사진만 담긴 앨범은 빈 앨범이다. 그 사진까지 세어 "사진 N장" 으로
  // 막으면 거절 문구가 비밀 사진 수를 알려 주므로, 판단도 안내도 보이는 사진으로만 한다.
  const hidden = await hiddenAssetIdsForViewer(membership.role, prismaPublic, input.familyId)

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

      // cascade 는 하위 전체를 지운다 — 아래 개수 안내도 숨긴 앨범을 세게 된다.
      if (membership.role === 'family' && (await hasSecretDescendant(album, input.familyId, tx)))
        throw new ForbiddenError('album.deleteDenied')

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
            ...(hidden.length > 0 ? { assetId: { notIn: hidden } } : {}),
          },
        }),
      ])

      if ((childCount > 0 || attachmentCount > 0) && !input.cascade) {
        throw new ConflictError('album.hasContents', {
          albums: childCount,
          photos: attachmentCount,
        })
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
