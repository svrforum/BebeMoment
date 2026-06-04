import { randomBytes, randomUUID } from 'node:crypto'
import { signUploadToken } from '@/lib/jwt'
import { getTusStore } from '@/lib/tus-store'
import type { PrismaClient } from '@bebe/db-media'
import { Upload } from '@tus/server'

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
  notify?: boolean | undefined
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
  const notify = input.notify ?? true

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
      // Random placeholder hash to satisfy @@unique([familyId, sha256]).
      // Replaced with the real SHA256 of the original bytes after tus finish
      // (process-asset.ts hashes the buffer).
      sha256: randomBytes(32).toString('hex'),
      takenAt: input.takenAt ? new Date(input.takenAt) : new Date(),
      takenAtSource: input.takenAt ? 'manual' : 'uploaded',
      status: 'uploading',
      width: input.clientWidth ?? null,
      height: input.clientHeight ?? null,
    },
  })

  // Pre-register the tus upload in the FileStore datastore so the browser's
  // HEAD/PATCH requests against the deterministic /tus/<assetId> URL can find it.
  // Without this, tus-js-client (with `uploadUrl` set) does HEAD first and gets
  // 404 because the upload doesn't exist yet.
  await getTusStore().create(
    new Upload({
      id: assetId,
      size: input.sizeBytes,
      offset: 0,
      metadata: { filename: input.originalName, filetype: input.mime },
    }),
  )

  const uploadToken = await signUploadToken({
    sub: input.uploaderId,
    familyId: input.familyId,
    assetId,
    mime: input.mime,
    maxBytes: input.sizeBytes,
    convertToCompatible,
    notify,
  })

  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString()

  return {
    assetId,
    tusUploadUrl: `${publicBaseUrl.replace(/\/$/, '')}/media/v1/tus/${assetId}`,
    uploadToken,
    expiresAt,
  }
}
