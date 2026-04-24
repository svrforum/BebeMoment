import { deriveTakenAt, needsConvert, parseExif } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import type { ProgressEvent } from '../progress/channel'
import { convertImageIfNeeded } from './convert'
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
}

export async function processAsset(args: ProcessAssetArgs): Promise<void> {
  const { job, prisma, storage, publishProgress, logger } = args

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

    let derivatives: Record<string, string> = {}
    let width: number | undefined
    let height: number | undefined
    let durationMs: number | undefined

    if (asset.kind === 'image') {
      const r = await processImage({ originalKey, assetId: asset.id }, storage)
      derivatives = r.derivatives
      width = r.width
      height = r.height
    } else if (asset.kind === 'video') {
      const r = await processVideo({ originalKey, assetId: asset.id }, storage)
      derivatives = r.derivatives
      width = r.width
      height = r.height
      durationMs = r.durationMs
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
