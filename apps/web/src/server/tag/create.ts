import { can } from '@bebe/core'
import type { PrismaClient as PrismaPublic, Tag } from '@bebe/db-public'
import { z } from 'zod'
import { ForbiddenError } from '../error'
import { isUniqueViolation } from '../prisma-errors'
import { slugifyTag } from './slug'

const Input = z.object({
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})

/**
 * Create a tag, or return the existing one with the same slug. Idempotent so
 * the autocomplete-then-create flow on the detail page never errors when two
 * users hit the same name at once.
 */
export async function createOrGetTag(
  raw: unknown,
  prismaPublic: PrismaPublic,
): Promise<Tag> {
  const input = Input.parse(raw)
  const slug = slugifyTag(input.name)
  if (!slug) throw new Error('태그 이름이 비어있어요')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'tag.create')) {
    throw new ForbiddenError('태그를 만들 권한이 없어요')
  }

  const existing = await prismaPublic.tag.findFirst({
    where: { familyId: input.familyId, slug, deletedAt: null },
  })
  if (existing) return existing

  // Concurrent creators with the same slug both pass the existence check;
  // the partial unique index `tags_family_slug_unique` lets only one win.
  // The loser re-reads — autocomplete-then-create flow stays idempotent.
  try {
    return await prismaPublic.tag.create({
      data: {
        familyId: input.familyId,
        name: input.name.trim(),
        slug,
        ...(input.color ? { color: input.color } : {}),
        createdByUserId: input.byUserId,
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await prismaPublic.tag.findFirst({
        where: { familyId: input.familyId, slug, deletedAt: null },
      })
      if (winner) return winner
    }
    throw err
  }
}
