import { can } from '@bebe/core'
import type { PrismaClient as PrismaPublic, Tag } from '@bebe/db-public'
import { z } from 'zod'
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
export async function renameTag(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<Tag> {
  const input = Input.parse(raw)
  const slug = slugifyTag(input.name)
  if (!slug) throw new Error('태그 이름이 비어있어요')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'tag.rename')) {
    throw new Error('No permission to rename tags')
  }

  const tag = await prismaPublic.tag.findFirst({
    where: { id: input.tagId, familyId: input.familyId, deletedAt: null },
  })
  if (!tag) throw new Error('tag not found')

  if (slug !== tag.slug) {
    const conflict = await prismaPublic.tag.findFirst({
      where: {
        familyId: input.familyId,
        slug,
        deletedAt: null,
        id: { not: tag.id },
      },
    })
    if (conflict) throw new Error('같은 이름의 태그가 이미 있어요')
  }

  return prismaPublic.tag.update({
    where: { id: tag.id },
    data: { name: input.name.trim(), slug },
  })
}
