import { randomBytes } from 'node:crypto'
import { deriveTakenAt, needsConvert, parseExif } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import type { ProgressEvent } from '../progress/channel'
import { convertImageIfNeeded } from './convert'
import { applyDedup } from './dedup'
import { derivativeKeysFor } from './derivative-trios'
import { type EnqueueNotification, enqueueNotification } from './enqueue-notification'
import { processImage } from './image-pipeline'
import type { ProcessAssetJob } from './types'
import { processVideo } from './video-pipeline'

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

export type ProcessAssetArgs = {
  job: ProcessAssetJob
  prisma: PrismaClient
  storage: StorageAdapter
  publishProgress: (event: ProgressEvent) => Promise<void>
  logger: pino.Logger
  enqueueNotification?: EnqueueNotification
  /** BullMQ 마지막 attempt 면 true — 이때만 부분 생성된 파생물을 정리한다(재시도가
   *  남았으면 다음 attempt 가 같은 키로 덮어쓰므로 정리하지 않는다). worker 가 계산. */
  isFinalAttempt?: boolean
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
    if ((await applyDedup({ asset, prisma, storage, publishProgress, logger })) === 'handled') {
      return
    }

    let exifResult: Awaited<ReturnType<typeof parseExif>> = {}
    // 이미지는 원본을 한 번만 읽어 EXIF 파싱과 파생물 생성이 같은 버퍼를 공유한다
    // (과거엔 EXIF·파이프라인이 각각 풀버퍼로 읽어 저사양 NAS 에서 IO·메모리 2배).
    let originalBuf: Buffer | undefined
    if (asset.kind === 'image') {
      originalBuf = await collect(await storage.read(asset.originalKey))
      exifResult = await parseExif(originalBuf)
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
    let oldOriginalKey: string | null = null
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
        oldOriginalKey = asset.originalKey
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
      // 변환했으면 새 키(변환본)를 파이프라인이 직접 읽어야 하므로 버퍼 재사용 불가.
      const r = await processImage(
        {
          originalKey,
          assetId: asset.id,
          ...(!convertedFrom && originalBuf ? { buffer: originalBuf } : {}),
        },
        storage,
      )
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

    // 커밋이 성공한 뒤에만 옛 원본을 지운다(원본 대체). 실패 시엔 위 catch 로 가
    // 원본이 보존되어 재시도가 다시 읽을 수 있다. 삭제 실패는 자산이 이미 ready 라
    // 치명적이지 않으므로 경고만.
    if (oldOriginalKey) {
      try {
        await storage.delete(oldOriginalKey)
      } catch (delErr) {
        logger.warn(
          { assetId: asset.id, key: oldOriginalKey, err: delErr },
          'failed to delete converted original',
        )
      }
    }

    await publishProgress({
      type: 'status',
      assetId: asset.id,
      familyId: asset.familyId,
      status: 'ready',
      derivatives,
    })

    // asset.uploaded 잡은 항상 enqueue 한다(얼굴 인식 트리거 등). 단 notify:false
    // (스토리 첨부 사진)면 payload 에 suppressPush 를 실어 워커가 푸시만 건너뛴다.
    await enqueue({
      familyId: asset.familyId,
      actorUserId: asset.uploadedByUserId,
      type: 'asset.uploaded',
      payload: {
        assetId: asset.id,
        ...(job.notify === false ? { suppressPush: 'true' } : {}),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // sha256 을 무작위 placeholder 로 되돌린다. applyDedup 이 real sha256 을 이미
    // 커밋한 뒤 파생물 생성이 실패하면, failed 자산이 (familyId, sha256) 유니크
    // 슬롯을 영구 점유해 같은 사진 재업로드가 거짓 '중복'으로 막혔다(initAsset 의
    // placeholder 와 동일 형식으로 슬롯을 비운다). 재시도는 다시 real sha 를 쓴다.
    await prisma.asset.update({
      where: { id: asset.id, familyId: asset.familyId },
      data: {
        status: 'failed',
        processingError: message,
        sha256: randomBytes(32).toString('hex'),
      },
    })
    await publishProgress({
      type: 'status',
      assetId: asset.id,
      familyId: asset.familyId,
      status: 'failed',
      reason: message,
    })
    // 마지막 attempt 면 부분 생성된 파생물 파일을 정리한다. 실패 자산의 derivatives
    // 는 DB 에 안 남아 purge 가 못 찾으므로 여기서 best-effort 로 지운다(ENOENT 무시).
    if (args.isFinalAttempt) {
      await Promise.all(
        derivativeKeysFor(asset.id).map((key) =>
          storage.delete(key).catch((delErr: unknown) => {
            logger.warn(
              { assetId: asset.id, key, err: delErr },
              'failed to delete orphan derivative',
            )
          }),
        ),
      )
    }
    throw err
  }
}
