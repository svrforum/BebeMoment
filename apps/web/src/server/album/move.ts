import { can } from '@bebe/core'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { MAX_DEPTH, computePath, isDescendant, rewritePathPrefix } from './path'

const Input = z.object({
  albumId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  /** New parent. `null` means move to root. */
  newParentId: z.string().uuid().nullable(),
})

/**
 * Move an album (and its subtree) to a new parent. Single transaction:
 * 1. Reject self-parent
 * 2. Reject cycle (newParent inside subtree)
 * 3. Reject if depth ceiling would be breached
 * 4. Rewrite path / depth on self + every descendant
 *
 * Sibling-name uniqueness is re-checked at the new location.
 */
export async function moveAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<Album> {
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
      can(membership.role, 'album.update.own')) ||
    can(membership.role, 'album.update.any')
  if (!allowed) throw new Error('No permission to move this album')

  if (input.newParentId === album.id) throw new Error('자기 자신을 부모로 둘 수 없어요')
  if (input.newParentId === album.parentId) return album // no-op

  let newParentPath: string | null = null
  let newParentDepth = -1
  if (input.newParentId) {
    const parent = await prismaPublic.album.findFirst({
      where: {
        id: input.newParentId,
        familyId: input.familyId,
        deletedAt: null,
      },
    })
    if (!parent) throw new Error('new parent not found')
    if (isDescendant(parent.path, album.path)) {
      throw new Error('하위 앨범을 부모로 둘 수 없어요')
    }
    newParentPath = parent.path
    newParentDepth = parent.depth
  }

  // Subtree depth check.
  const deepest = await prismaPublic.album.aggregate({
    where: {
      familyId: input.familyId,
      OR: [
        { path: album.path },
        { path: { startsWith: `${album.path}/` } },
      ],
    },
    _max: { depth: true },
  })
  const subtreeDepth = (deepest._max.depth ?? album.depth) - album.depth
  if (newParentDepth + 1 + subtreeDepth > MAX_DEPTH) {
    throw new Error(`이동하면 최대 깊이 (${MAX_DEPTH + 1}단계) 를 넘어가요`)
  }

  // Sibling name conflict at the new parent.
  const conflict = await prismaPublic.album.findFirst({
    where: {
      familyId: input.familyId,
      parentId: input.newParentId,
      name: album.name,
      deletedAt: null,
      id: { not: album.id },
    },
  })
  if (conflict) throw new Error('이동할 위치에 같은 이름의 앨범이 이미 있어요')

  const newPath = computePath(newParentPath, album.id)
  const newDepth = newParentDepth + 1
  const depthDelta = newDepth - album.depth

  const subtree = await prismaPublic.album.findMany({
    where: {
      familyId: input.familyId,
      OR: [{ id: album.id }, { path: { startsWith: `${album.path}/` } }],
    },
    select: { id: true, path: true, depth: true },
  })

  const updates = subtree.map((node) => {
    const nextPath = rewritePathPrefix(node.path, album.path, newPath)
    const nextDepth = node.depth + depthDelta
    return prismaPublic.album.update({
      where: { id: node.id },
      data: {
        path: nextPath,
        depth: nextDepth,
        ...(node.id === album.id ? { parentId: input.newParentId } : {}),
      },
    })
  })

  const results = await prismaPublic.$transaction(updates)
  // The first update is always the moved album itself.
  const moved = results[0]
  if (!moved) throw new Error('move failed')
  return moved
}
