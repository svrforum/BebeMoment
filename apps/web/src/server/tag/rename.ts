import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaPublic, Tag } from '@bebe/db-public'
import { z } from 'zod'
import { revalidateTagsTag } from '../cache-tags'
import { ConflictError, ForbiddenError, NotFoundError } from '../error'
import { isUniqueViolation } from '../prisma-errors'
import { slugifyTag } from './slug'

const Input = z.object({
  tagId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z.string().min(1).max(40),
})

/**
 * Rename a tag. The slug recomputes too — a partial unique index already
 * guards against collision, but we pre-check so callers get a friendly
 * error instead of a raw P2002.
 */
export async function renameTag(raw: unknown, prismaPublic: PrismaPublic): Promise<Tag> {
  const input = Input.parse(raw)
  const slug = slugifyTag(input.name)
  if (!slug) throw new Error('태그 이름이 비어있어요')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!membership || membership.deletedAt || !resolveCan(membership.role, 'tag.rename', familyCaps)) {
    throw new ForbiddenError('태그를 변경할 권한이 없어요')
  }

  const tag = await prismaPublic.tag.findFirst({
    where: { id: input.tagId, familyId: input.familyId, deletedAt: null },
  })
  if (!tag) throw new NotFoundError('태그를 찾을 수 없어요')

  try {
    const renamed = await prismaPublic.tag.update({
      where: { id: tag.id },
      data: { name: input.name.trim(), slug },
    })
    revalidateTagsTag(input.familyId)
    return renamed
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('같은 이름의 태그가 이미 있어요')
    }
    throw err
  }
}
