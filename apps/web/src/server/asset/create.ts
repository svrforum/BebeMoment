import { can } from '@bebe/core'
import type { Asset, AssetKind, PrismaClient, TakenAtSource } from '@bebe/db'

export type CreateAssetInput = {
  familyId: string
  uploadedByUserId: string
  kind: AssetKind
  originalKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: bigint
  sha256: string
  takenAt: Date
  takenAtSource: TakenAtSource
}

export async function createAsset(
  input: CreateAssetInput,
  prisma: PrismaClient,
): Promise<Asset> {
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.uploadedByUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'asset.upload')) {
    throw new Error('No permission to upload to this family')
  }

  return prisma.asset.create({
    data: {
      familyId: input.familyId,
      uploadedByUserId: input.uploadedByUserId,
      kind: input.kind,
      originalKey: input.originalKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      takenAt: input.takenAt,
      takenAtSource: input.takenAtSource,
      status: 'uploading',
    },
  })
}
