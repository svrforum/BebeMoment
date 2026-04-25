import { can } from '@bebe/core'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { MAX_DEPTH, computePath } from './path'

const Input = z.object({
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z.string().min(1).max(80).refine((s) => !s.includes('/'), {
    message: 'name must not contain slashes',
  }),
  parentId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
})

export async function createAlbum(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<Album> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'album.create')) {
    throw new Error('No permission')
  }

  let parentPath: string | null = null
  let parentDepth = -1
  if (input.parentId) {
    const parent = await prismaPublic.album.findFirst({
      where: { id: input.parentId, familyId: input.familyId, deletedAt: null },
    })
    if (!parent) throw new Error('parent album not found')
    if (parent.depth >= MAX_DEPTH) {
      throw new Error(`최대 깊이 (${MAX_DEPTH + 1}단계) 를 넘어요`)
    }
    parentPath = parent.path
    parentDepth = parent.depth
  }

  // Sibling-name uniqueness is enforced by the partial unique index in the
  // migration. Pre-fetch and surface a friendly error so callers don't see a
  // raw P2002 from Prisma.
  const conflict = await prismaPublic.album.findFirst({
    where: {
      familyId: input.familyId,
      parentId: input.parentId ?? null,
      name: input.name,
      deletedAt: null,
    },
  })
  if (conflict) throw new Error('같은 위치에 같은 이름의 앨범이 이미 있어요')

  // Generate id up-front so the materialized path can include it.
  const ownId = randomUUID()
  const path = computePath(parentPath, ownId)

  return prismaPublic.album.create({
    data: {
      id: ownId,
      familyId: input.familyId,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      name: input.name.trim(),
      ...(input.description ? { description: input.description } : {}),
      path,
      depth: parentDepth + 1,
      createdByUserId: input.byUserId,
    },
  })
}
