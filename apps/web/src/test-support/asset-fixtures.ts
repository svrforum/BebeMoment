import { ForbiddenError } from '@/server/error'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import type {
  Asset,
  AssetKind,
  AssetStatus,
  PrismaClient as PrismaMedia,
  TakenAtSource,
} from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

// 테스트에서 자산 행을 만들고 상태를 바꾸는 픽스처. 실제 업로드에서는 media 가 자산 행을
// 만들고(web 은 upload/init-upload.ts 로 권한만 확인해 넘긴다) 처리 결과도 media 워커가
// 쓴다 — 업로드 규칙을 여기에 넣어도 운영 경로에는 반영되지 않는다.

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

/** status='uploading' 자산 행. 올린 사람이 그 가족에서 asset.upload 권한이 있어야 한다. */
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
