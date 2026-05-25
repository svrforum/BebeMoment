import { can } from '@bebe/core'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'
import { isUniqueViolation } from '../prisma-errors'
import { MAX_DEPTH, computePath, isDescendant, rewritePathPrefix } from './path'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  /** New parent. `null` means move to root. */
  newParentId: z.string().uuid().nullable(),
})

/**
 * Move an album (and its subtree) to a new parent. Single interactive
 * transaction so reads + writes see a consistent view:
 *
 * 1. Reload album, parent, subtree FOR UPDATE-equivalent consistency.
 * 2. Reject self-parent.
 * 3. Reject cycle (newParent inside subtree).
 * 4. Reject if depth ceiling would be breached.
 * 5. Reject sibling-name conflict at the new location.
 * 6. Rewrite path / depth on self + every descendant.
 *
 * Catches P2002 from the partial sibling-unique index in case a concurrent
 * mover stole the spot between our check and our write, and surfaces a
 * Korean error instead of a 500.
 */
export async function moveAlbum(raw: unknown, prismaPublic: PrismaPublic): Promise<Album> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt) throw new ForbiddenError('가족 멤버가 아니에요')

  try {
    const moved = await prismaPublic.$transaction(async (tx) => {
      const album = await tx.album.findFirst({
        where: { id: input.albumId, familyId: input.familyId, deletedAt: null },
      })
      if (!album) throw new NotFoundError('앨범을 찾을 수 없어요')

      const allowed =
        (album.createdByUserId === input.byUserId && can(membership.role, 'album.update.own')) ||
        can(membership.role, 'album.update.any')
      if (!allowed) throw new ForbiddenError('이 앨범을 옮길 권한이 없어요')

      if (input.newParentId === album.id) throw new ConflictError('자기 자신을 부모로 둘 수 없어요')
      if (input.newParentId === album.parentId) return album

      let newParentPath: string | null = null
      let newParentDepth = -1
      if (input.newParentId) {
        const parent = await tx.album.findFirst({
          where: {
            id: input.newParentId,
            familyId: input.familyId,
            deletedAt: null,
          },
        })
        if (!parent) throw new NotFoundError('이동할 위치를 찾을 수 없어요')
        if (isDescendant(parent.path, album.path)) {
          throw new ConflictError('하위 앨범을 부모로 둘 수 없어요')
        }
        newParentPath = parent.path
        newParentDepth = parent.depth
      }

      // Subtree depth check inside the same tx so adds during move can't
      // sneak past us.
      const deepest = await tx.album.aggregate({
        where: {
          familyId: input.familyId,
          OR: [{ path: album.path }, { path: { startsWith: `${album.path}/` } }],
        },
        _max: { depth: true },
      })
      const subtreeDepth = (deepest._max.depth ?? album.depth) - album.depth
      if (newParentDepth + 1 + subtreeDepth > MAX_DEPTH) {
        throw new ConflictError(`이동하면 최대 깊이 (${MAX_DEPTH + 1}단계) 를 넘어가요`)
      }

      const conflict = await tx.album.findFirst({
        where: {
          familyId: input.familyId,
          parentId: input.newParentId,
          name: album.name,
          deletedAt: null,
          id: { not: album.id },
        },
      })
      if (conflict) throw new ConflictError('이동할 위치에 같은 이름의 앨범이 이미 있어요')

      const newPath = computePath(newParentPath, album.id)
      const newDepth = newParentDepth + 1
      const depthDelta = newDepth - album.depth

      const subtree = await tx.album.findMany({
        where: {
          familyId: input.familyId,
          OR: [{ id: album.id }, { path: { startsWith: `${album.path}/` } }],
        },
        select: { id: true, path: true, depth: true },
      })

      // Update self first so caller sees the moved row in results[0].
      const root = await tx.album.update({
        where: { id: album.id },
        data: {
          parentId: input.newParentId,
          path: newPath,
          depth: newDepth,
        },
      })

      // Then the descendants. Each gets its prefix rewritten + depth shifted
      // by the same delta.
      for (const node of subtree) {
        if (node.id === album.id) continue
        await tx.album.update({
          where: { id: node.id },
          data: {
            path: rewritePathPrefix(node.path, album.path, newPath),
            depth: node.depth + depthDelta,
          },
        })
      }
      return root
    })
    revalidateAlbumsTag(input.familyId)
    return moved
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('이동할 위치에 같은 이름의 앨범이 이미 있어요')
    }
    throw err
  }
}
