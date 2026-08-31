import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { z } from 'zod'
import { ForbiddenError, NotFoundError } from '../error'
import { FILENAME_RE } from '@bebe/media-client'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  // 규칙을 복제하지 않고 media 의 것을 그대로 쓴다 — 여기서 통과시키면 media 가 거절해
  // 사용자에겐 번역 안 된 '[VALIDATION_ERROR]' 가 그대로 보였다.
  filename: z.string().min(1).max(255).regex(FILENAME_RE, 'asset.filenameInvalid').optional(),
  caption: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
})

export type UpdateMetadataResult = {
  filename: string
  caption: string | null
  takenAt: string
  takenAtSource: string
}

/**
 * Owner of the asset (or owner/guardian of the family) can edit metadata.
 * Family viewers can edit only their own uploads.
 */
export async function updateAssetMetadata(
  raw: unknown,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<UpdateMetadataResult> {
  const input = Input.parse(raw)

  const asset = await prismaMedia.asset.findFirst({
    where: { id: input.assetId, familyId: input.familyId, deletedAt: null },
    select: { id: true, uploadedByUserId: true },
  })
  if (!asset) throw new NotFoundError('asset.notFound')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt) throw new ForbiddenError('asset.permissionDenied')

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  const isOwner = asset.uploadedByUserId === input.byUserId
  const allowed =
    (isOwner && resolveCan(membership.role, 'asset.edit.own', familyCaps)) ||
    resolveCan(membership.role, 'asset.edit.any', familyCaps)
  if (!allowed) throw new ForbiddenError('asset.editDenied')

  return media.updateAssetMetadata(input.assetId, {
    familyId: input.familyId,
    editedByUserId: input.byUserId,
    ...(input.filename !== undefined ? { filename: input.filename } : {}),
    ...(input.caption !== undefined ? { caption: input.caption } : {}),
    ...(input.takenAt !== undefined ? { takenAt: input.takenAt } : {}),
  })
}
