import { randomBytes, randomUUID } from 'node:crypto'
import { getEnv } from '@/lib/env'
import { signUploadToken } from '@/lib/jwt'
import { getTusStore, tusTmpDir } from '@/lib/tus-store'
import { wallClockAsUtc } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-media'
import { Upload } from '@tus/server'
import { assertDiskSpaceForUpload } from './preflight'

export type InitAssetInput = {
  familyId: string
  uploaderId: string
  mime: string
  sizeBytes: number
  originalName: string
  takenAt?: string | undefined
  fileModifiedAt?: string | undefined
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
  const fileModifiedAt = input.fileModifiedAt ? new Date(input.fileModifiedAt) : null
  const convertToCompatible = input.convertToCompatible ?? false
  const notify = input.notify ?? true
  const env = getEnv()

  // 가족 단위 저장 쿼터(env, 기본 무제한) — 설정 시 기존 비삭제 자산 합계 + 이번 크기가
  // 한도를 넘으면 init 에서 거부해 tus-tmp 점유 전에 막는다.
  const quotaBytes = env.MEDIA_FAMILY_QUOTA_BYTES
  if (quotaBytes > 0) {
    const agg = await prismaMedia.asset.aggregate({
      where: { familyId: input.familyId, deletedAt: null },
      _sum: { sizeBytes: true },
    })
    const used = agg._sum.sizeBytes ?? 0n
    if (used + BigInt(input.sizeBytes) > BigInt(quotaBytes)) {
      throw new Error('family storage quota exceeded')
    }
  }

  await assertDiskSpaceForUpload({
    sizeBytes: input.sizeBytes,
    mode: env.STORAGE_MODE,
    tusTmpDir: tusTmpDir(),
  })

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
      // 명시 takenAt > 파일 수정시각(filemtime) > 업로드시각(uploaded). 워커가 EXIF·파일명
      // 으로 다시 확정하지만, 둘 다 없으면 파일 수정시각으로 폴백한다. 수정시각·업로드시각은
      // 실제 순간이라 벽시계로 옮겨 심는다(처리에 실패한 사진은 이 값을 달고 남는다). 수정시각의
      // 실제 순간은 file_modified_at 에 따로 남겨, 워커가 늘 거기서 다시 계산하게 한다.
      takenAt: input.takenAt
        ? new Date(input.takenAt)
        : wallClockAsUtc(fileModifiedAt ?? new Date()),
      takenAtSource: input.takenAt ? 'manual' : fileModifiedAt ? 'filemtime' : 'uploaded',
      fileModifiedAt,
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
