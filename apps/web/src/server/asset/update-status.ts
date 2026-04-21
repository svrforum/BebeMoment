import type { Asset, AssetStatus, PrismaClient, TakenAtSource } from '@bebe/db'

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
  prisma: PrismaClient,
): Promise<Asset> {
  const { assetId, familyId, derivatives, exifRaw, ...rest } = input
  return prisma.asset.update({
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
