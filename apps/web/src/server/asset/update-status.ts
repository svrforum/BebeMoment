import type { Asset, AssetStatus, PrismaClient as PrismaMedia, TakenAtSource } from '@bebe/db-media'

export type UpdateStatusInput = {
  assetId: string
  familyId: string
  status: AssetStatus
  processingError?: string
  derivatives?: Record<string, string>
  takenAt?: Date
  takenAtSource?: TakenAtSource
  gpsLat?: number
  gpsLng?: number
  cameraMake?: string
  cameraModel?: string
  exifRaw?: Record<string, unknown>
  width?: number
  height?: number
  durationMs?: number
  originalConvertedFrom?: string
  originalKey?: string
  mimeType?: string
  sizeBytes?: bigint
}

export async function updateAssetStatus(
  input: UpdateStatusInput,
  prismaMedia: PrismaMedia,
): Promise<Asset> {
  const { assetId, familyId, derivatives, exifRaw, ...rest } = input
  return prismaMedia.asset.update({
    where: { id: assetId, familyId },
    data: {
      ...rest,
      // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
      ...(derivatives !== undefined ? { derivatives: derivatives as any } : {}),
      // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
      ...(exifRaw !== undefined ? { exifRaw: exifRaw as any } : {}),
    },
  })
}
