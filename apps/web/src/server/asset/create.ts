import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Asset, AssetKind, TakenAtSource } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { ForbiddenError } from '../error'

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
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<Asset> {
  const membership = await prismaPublic.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.uploadedByUserId } },
  })
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (
    !membership ||
    membership.deletedAt ||
    !resolveCan(membership.role, 'asset.upload', familyCaps)
  ) {
    throw new ForbiddenError('asset.uploadDenied')
  }

  return prismaMedia.asset.create({
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
