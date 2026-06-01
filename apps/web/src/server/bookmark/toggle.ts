import { can } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { z } from 'zod'
import { isUniqueViolation } from '../prisma-errors'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
})

export async function toggleBookmark(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<{ bookmarked: boolean }> {
  const input = Input.parse(raw)

  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
  })
  if (!asset) throw new Error('asset not found in this family')

  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'social.react')) {
    throw new Error('No permission: not a member of this family')
  }

  const existing = await prismaPublic.assetBookmark.findFirst({
    where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
  })

  if (existing) {
    await prismaPublic.assetBookmark.deleteMany({
      where: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
    })
    return { bookmarked: false }
  }
  try {
    await prismaPublic.assetBookmark.create({
      data: { assetId: input.assetId, userId: input.byUserId, familyId: input.familyId },
    })
  } catch (e) {
    // 동시 토글로 이미 생성됨 — 멱등하게 북마크 상태로 본다.
    if (!isUniqueViolation(e)) throw e
  }
  return { bookmarked: true }
}
