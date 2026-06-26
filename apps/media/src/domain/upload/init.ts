import { randomBytes, randomUUID } from 'node:crypto'
import { statfs } from 'node:fs/promises'
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
  const convertToCompatible = input.convertToCompatible ?? false
  const notify = input.notify ?? true

  // 가족 단위 저장 쿼터(env, 기본 무제한) — 설정 시 기존 비삭제 자산 합계 + 이번 크기가
  // 한도를 넘으면 init 에서 거부해 tus-tmp 점유 전에 막는다.
  const quotaBytes = Number(process.env.MEDIA_FAMILY_QUOTA_BYTES ?? 0)
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

  // 로컬 스토리지 디스크 여유공간 프리플라이트 — 꽉 찬 디스크에서 업로드를 시작하면
  // tus-tmp·파생물·DB 가 깨진다. 이번 파일(+파생물 여유 ~1.5x)+256MB 마진보다 적으면 거부.
  // statfs 미지원/오류는 가용성 우선으로 무시.
  if ((process.env.STORAGE_MODE ?? 'local') === 'local') {
    try {
      const fsStat = await statfs(process.env.STORAGE_PATH ?? '/data')
      const free = BigInt(fsStat.bavail) * BigInt(fsStat.bsize)
      const needed = (BigInt(input.sizeBytes) * 3n) / 2n + 256n * 1024n * 1024n
      if (free < needed) throw new Error('insufficient disk space for upload')
    } catch (e) {
      if ((e as Error).message === 'insufficient disk space for upload') throw e
    }
  }

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
      // 으로 다시 확정하지만, 둘 다 없으면 process-asset 이 이 filemtime 값을 폴백으로 쓴다.
      takenAt: new Date(input.takenAt ?? input.fileModifiedAt ?? Date.now()),
      takenAtSource: input.takenAt ? 'manual' : input.fileModifiedAt ? 'filemtime' : 'uploaded',
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
