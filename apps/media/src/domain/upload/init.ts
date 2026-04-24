import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@bebe/db-media'
import { signUploadToken } from '@/lib/jwt'

export type InitAssetInput = {
  familyId: string
  uploaderId: string
  mime: string
  sizeBytes: number
  originalName: string
  takenAt?: string | undefined
  clientBlurhash?: string | undefined
  clientAspectRatio?: number | undefined
  clientWidth?: number | undefined
  clientHeight?: number | undefined
  convertToCompatible?: boolean | undefined
}

export type InitAssetResult = {
  assetId: string
  tusUploadUrl: string
  uploadToken: string
  expiresAt: string
}

const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000

export async function initAsset(
  input: InitAssetInput,
  prismaMedia: PrismaClient,
  publicBaseUrl: string,
): Promise<InitAssetResult> {
  const assetId = randomUUID()
  const convertToCompatible = input.convertToCompatible ?? false

  await prismaMedia.asset.create({
    data: {
      id: assetId,
      familyId: input.familyId,
      uploadedByUserId: input.uploaderId,
      kind: input.mime.startsWith('video/') ? 'video' : 'image',
      originalKey: `families/${input.familyId}/assets/${assetId}/original`,
      originalFilename: input.originalName,
      mimeType: input.mime,
      sizeBytes: BigInt(input.sizeBytes),
      sha256: ''.padEnd(64, '0'),
      takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
      takenAtSource: input.takenAt ? 'manual' : 'uploaded',
      status: 'uploading',
      width: input.clientWidth ?? null,
      height: input.clientHeight ?? null,
    },
  })

  const uploadToken = await signUploadToken({
    sub: input.uploaderId,
    familyId: input.familyId,
    assetId,
    mime: input.mime,
    maxBytes: input.sizeBytes,
    convertToCompatible,
  })

  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString()

  return {
    assetId,
    tusUploadUrl: `${publicBaseUrl.replace(/\/$/, '')}/media/v1/tus/${assetId}`,
    uploadToken,
    expiresAt,
  }
}
