import { can } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { z } from 'zod'

const Input = z.object({
  assetId: z.string().uuid(),
  familyId: z.string().uuid(),
  byUserId: z.string().uuid(),
  filename: z.string().min(1).max(255).optional(),
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
  if (!asset) throw new Error('asset not found')

  const membership = await prismaPublic.membership.findUnique({
    where: {
      familyId_userId: { familyId: input.familyId, userId: input.byUserId },
    },
  })
  if (!membership || membership.deletedAt) throw new Error('No permission')

  const isOwner = asset.uploadedByUserId === input.byUserId
  const allowed =
    (isOwner && can(membership.role, 'asset.edit.own')) || can(membership.role, 'asset.edit.any')
  if (!allowed) throw new Error('No permission to edit this asset')

  return media.updateAssetMetadata(input.assetId, {
    familyId: input.familyId,
    editedByUserId: input.byUserId,
    ...(input.filename !== undefined ? { filename: input.filename } : {}),
    ...(input.caption !== undefined ? { caption: input.caption } : {}),
    ...(input.takenAt !== undefined ? { takenAt: input.takenAt } : {}),
  })
}
