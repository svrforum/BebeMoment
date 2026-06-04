import { randomUUID } from 'node:crypto'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { Album, PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateAlbumsTag } from '../cache-tags'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'
import { isUniqueViolation } from '../prisma-errors'
import { MAX_DEPTH, computePath } from './path'

const Input = z.object({
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(80)
    .refine((s) => !s.includes('/'), {
      message: 'name must not contain slashes',
    }),
  parentId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  secret: z.boolean().optional(),
})

export async function createAlbum(raw: unknown, prismaPublic: PrismaPublic): Promise<Album> {
  const input = Input.parse(raw)

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'album.create', familyCaps)
  ) {
    throw new ForbiddenError('album.createDenied')
  }
  // 비밀 앨범은 부모(owner/guardian)만 만들 수 있다 — family 는 보지도 못하므로.
  if (input.secret && membership.role === 'family') {
    throw new ForbiddenError('album.secretGuardianOnly')
  }

  let parentPath: string | null = null
  let parentDepth = -1
  if (input.parentId) {
    const parent = await prismaPublic.album.findFirst({
      where: { id: input.parentId, familyId: input.familyId, deletedAt: null },
    })
    if (!parent) throw new NotFoundError('album.parentNotFound')
    if (parent.depth >= MAX_DEPTH) {
      throw new ConflictError(`최대 깊이 (${MAX_DEPTH + 1}단계) 를 넘어요`)
    }
    parentPath = parent.path
    parentDepth = parent.depth
  }

  const ownId = randomUUID()
  const path = computePath(parentPath, ownId)

  // Sibling-uniqueness is enforced by the partial unique index in the
  // migration. Catch P2002 instead of pre-checking, so concurrent creates
  // resolve cleanly without a check-then-write race.
  try {
    const created = await prismaPublic.album.create({
      data: {
        id: ownId,
        familyId: input.familyId,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        name: input.name.trim(),
        ...(input.description ? { description: input.description } : {}),
        path,
        depth: parentDepth + 1,
        ...(input.secret ? { secret: true } : {}),
        createdByUserId: input.byUserId,
      },
    })
    revalidateAlbumsTag(input.familyId)
    return created
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('album.duplicateName')
    }
    throw err
  }
}
