import { createHash } from 'node:crypto'
import { deriveTakenAt, needsConvert, parseExif } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import type { ProgressEvent } from '../progress/channel'
import { convertImageIfNeeded } from './convert'
import { type EnqueueNotification, enqueueNotification } from './enqueue-notification'
import { processImage } from './image-pipeline'
import type { ProcessAssetJob } from './types'
import { processVideo } from './video-pipeline'

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

// Stream-hash so multi-hundred-MB videos don't get buffered into memory
// (Synology ARM NAS RAM is tight). Image branch separately collects bytes
// for EXIF parsing — two reads on image is acceptable; one read for video
// avoids OOM.
async function streamSha256(stream: NodeJS.ReadableStream): Promise<string> {
  const hash = createHash('sha256')
  for await (const c of stream) hash.update(c as Buffer)
  return hash.digest('hex')
}

// Duck-typed: `instanceof PrismaClientKnownRequestError` is unreliable across
// the db-media package boundary (proxy in `packages/db-media/src/index.ts`),
// and Prisma docs explicitly support reading `.code` directly.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

export type ProcessAssetArgs = {
  job: ProcessAssetJob
  prisma: PrismaClient
  storage: StorageAdapter
  publishProgress: (event: ProgressEvent) => Promise<void>
  logger: pino.Logger
  enqueueNotification?: EnqueueNotification
}

export async function processAsset(args: ProcessAssetArgs): Promise<void> {
  const { job, prisma, storage, publishProgress, logger } = args
  const enqueue = args.enqueueNotification ?? enqueueNotification

  const asset = await prisma.asset.findFirst({
    where: { id: job.assetId, familyId: job.familyId },
  })
  if (!asset) {
    throw new Error(`Asset ${job.assetId} not found in family ${job.familyId}`)
  }
  if (asset.status !== 'processing') {
    logger.warn(
      { assetId: asset.id, status: asset.status },
      'skipping asset with non-processing status',
    )
    return
  }

  try {
    // SHA256 dedup. initAsset wrote a random placeholder to satisfy
    // @@unique([familyId, sha256]); replace with the real digest now. On
    // P2002 a same-family duplicate already exists → delete the freshly
    // uploaded bytes and mark this asset failed without proceeding to
    // derivative generation.
    if (asset.kind === 'image' || asset.kind === 'video') {
      const sha256 = await streamSha256(await storage.read(asset.originalKey))
      try {
        await prisma.asset.update({
          where: { id: asset.id, familyId: asset.familyId },
          data: { sha256 },
        })
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
        // 같은 family·sha256 자산이 이미 있다(P2002). 업로드된 중복 바이트는 버리고,
        // 새 자산을 기존(canonical) 자산의 ready 별칭으로 만든다 — 스토리·앨범에 추가한
        // "이미 있는 사진"이 정상 표시되도록(이전엔 failed 처리돼 "처리중"으로 멈춰 보였음).
        const existing = await prisma.asset.findFirst({
          where: {
            familyId: asset.familyId,
            sha256,
            deletedAt: null,
            status: 'ready',
            NOT: { id: asset.id },
          },
        })
        try {
          await storage.delete(asset.originalKey)
        } catch (delErr) {
          logger.warn({ assetId: asset.id, err: delErr }, 'failed to delete duplicate upload bytes')
        }
        if (existing) {
          logger.info(
            { assetId: asset.id, duplicateOf: existing.id, familyId: asset.familyId },
            'duplicate upload — aliasing to existing asset',
          )
          // canonical 의 표시·다운로드 필드를 복사(derivative 키가 canonical 을 가리키므로
          // 별칭의 원본 바이트가 없어도 표시·다운로드 동작). sha256 은 placeholder 유지
          // (real sha256 은 unique 충돌). duplicateOf 로 목록에서 제외.
          await prisma.asset.update({
            where: { id: asset.id, familyId: asset.familyId },
            data: {
              status: 'ready',
              processingError: null,
              duplicateOf: existing.id,
              originalKey: existing.originalKey,
              mimeType: existing.mimeType,
              sizeBytes: existing.sizeBytes,
              width: existing.width,
              height: existing.height,
              durationMs: existing.durationMs,
              aspectRatioCached: existing.aspectRatioCached,
              blurhash: existing.blurhash,
              dominantColor: existing.dominantColor,
              takenAt: existing.takenAt,
              takenAtSource: existing.takenAtSource,
              // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
              derivatives: existing.derivatives as any,
            },
          })
          await publishProgress({
            type: 'status',
            assetId: asset.id,
            familyId: asset.familyId,
            status: 'ready',
            // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
            derivatives: existing.derivatives as any,
          })
          return
        }
        // canonical 을 못 찾으면(아직 ready 아님 등 드문 경우) 기존대로 실패 처리.
        logger.info(
          { assetId: asset.id, familyId: asset.familyId },
          'duplicate upload but no ready canonical — marking failed',
        )
        const reason = '같은 사진이 이미 있어요 (중복)'
        await prisma.asset.update({
          where: { id: asset.id, familyId: asset.familyId },
          data: { status: 'failed', processingError: reason },
        })
        await publishProgress({
          type: 'status',
          assetId: asset.id,
          familyId: asset.familyId,
          status: 'failed',
          reason,
        })
        return
      }
    }

    let exifResult: Awaited<ReturnType<typeof parseExif>> = {}
    if (asset.kind === 'image') {
      exifResult = await parseExif(await collect(await storage.read(asset.originalKey)))
    }

    const derived = deriveTakenAt({
      ...(exifResult.takenAt !== undefined ? { exifDateTimeOriginal: exifResult.takenAt } : {}),
      filename: asset.originalFilename,
      uploadedAt: asset.uploadedAt,
    })

    const convertEnabled = job.convertToCompatible ?? false
    let originalKey = asset.originalKey
    let mimeType = asset.mimeType
    let sizeBytes = asset.sizeBytes
    let convertedFrom: string | null = null
    if (convertEnabled && asset.kind === 'image' && needsConvert(asset.mimeType)) {
      const result = await convertImageIfNeeded(
        { originalKey: asset.originalKey, mimeType: asset.mimeType, assetId: asset.id },
        storage,
      )
      if (result) {
        originalKey = result.newKey
        mimeType = result.newMimeType
        sizeBytes = result.newSizeBytes
        convertedFrom = result.originalMimeType
      }
    }

    let derivatives: Record<string, unknown> = {}
    let width: number | undefined
    let height: number | undefined
    let durationMs: number | undefined
    let aspectRatio: number | null = null
    let blurhash: string | null = null
    let dominantColor: string | null = null

    if (asset.kind === 'image') {
      const r = await processImage({ originalKey, assetId: asset.id }, storage)
      derivatives = r.derivatives as unknown as Record<string, unknown>
      width = r.width
      height = r.height
      aspectRatio = r.aspectRatio
      blurhash = r.blurhash
      dominantColor = r.dominantColor
    } else if (asset.kind === 'video') {
      const r = await processVideo({ originalKey, assetId: asset.id }, storage)
      derivatives = r.derivatives as unknown as Record<string, unknown>
      width = r.width
      height = r.height
      durationMs = r.durationMs
      aspectRatio = r.aspectRatio
      blurhash = r.blurhash
      dominantColor = r.dominantColor
    }

    await prisma.asset.update({
      where: { id: asset.id, familyId: asset.familyId },
      data: {
        status: 'ready',
        originalKey,
        mimeType,
        sizeBytes,
        originalConvertedFrom: convertedFrom,
        takenAt: derived.value,
        takenAtSource: derived.source,
        ...(exifResult.gpsLat !== undefined ? { gpsLat: exifResult.gpsLat } : {}),
        ...(exifResult.gpsLng !== undefined ? { gpsLng: exifResult.gpsLng } : {}),
        ...(exifResult.cameraMake !== undefined ? { cameraMake: exifResult.cameraMake } : {}),
        ...(exifResult.cameraModel !== undefined ? { cameraModel: exifResult.cameraModel } : {}),
        ...(exifResult.raw !== undefined
          ? // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
            { exifRaw: exifResult.raw as any }
          : {}),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(durationMs !== undefined ? { durationMs } : {}),
        aspectRatioCached: aspectRatio,
        blurhash,
        dominantColor,
        // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
        derivatives: derivatives as any,
      },
    })

    await publishProgress({
      type: 'status',
      assetId: asset.id,
      familyId: asset.familyId,
      status: 'ready',
      derivatives,
    })

    await enqueue({
      familyId: asset.familyId,
      actorUserId: asset.uploadedByUserId,
      type: 'asset.uploaded',
      payload: { assetId: asset.id },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await prisma.asset.update({
      where: { id: asset.id, familyId: asset.familyId },
      data: { status: 'failed', processingError: message },
    })
    await publishProgress({
      type: 'status',
      assetId: asset.id,
      familyId: asset.familyId,
      status: 'failed',
      reason: message,
    })
    throw err
  }
}
