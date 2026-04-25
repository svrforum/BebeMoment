import type { PrismaClient } from '@bebe/db-media'
import type { UpdateAssetMetadataRequest } from '@bebe/media-client'

export type UpdateMetadataResult = {
  filename: string
  caption: string | null
  takenAt: Date
  takenAtSource: string
}

/**
 * Apply user-driven metadata edits to an asset. Only changes the columns
 * the user is allowed to edit — width / height / kind / mime are derived
 * from bytes and stay read-only.
 *
 * Tenant invariant: every WHERE includes familyId, so a token mix-up can't
 * cross-edit another family's asset.
 */
export async function updateAssetMetadata(
  args: {
    assetId: string
    input: UpdateAssetMetadataRequest
  },
  prisma: PrismaClient,
): Promise<UpdateMetadataResult> {
  const { assetId, input } = args

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, familyId: input.familyId, deletedAt: null },
  })
  if (!asset) throw new Error(`asset ${assetId} not found in this family`)

  const data: Record<string, unknown> = {}
  if (input.filename !== undefined) data.originalFilename = input.filename
  if (input.caption !== undefined) data.caption = input.caption
  if (input.takenAt !== undefined) {
    data.takenAt = new Date(input.takenAt)
    // User-supplied date — flip the source so we don't keep claiming it
    // came from EXIF.
    data.takenAtSource = 'manual'
  }

  if (Object.keys(data).length === 0) {
    return {
      filename: asset.originalFilename,
      caption: asset.caption,
      takenAt: asset.takenAt,
      takenAtSource: asset.takenAtSource,
    }
  }

  const updated = await prisma.asset.update({
    where: { id: asset.id, familyId: input.familyId },
    data,
  })
  return {
    filename: updated.originalFilename,
    caption: updated.caption,
    takenAt: updated.takenAt,
    takenAtSource: updated.takenAtSource,
  }
}
