import { parseEnv } from '@bebe/config'
import { deriveTakenAt, needsConvert, parseExif } from '@bebe/core'
import { prisma } from '../prisma-init'
import { type StorageAdapter, createAdapter } from '@bebe/storage'
import type IORedis from 'ioredis'
import pino from 'pino'
import { z } from 'zod'
import { publishAssetEvent } from '../pubsub'
import { convertImageIfNeeded } from './convert'
import { processImage } from './image-pipeline'
import type { ProcessAssetJob } from './types'
import { processVideo } from './video-pipeline'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const BoolSchema = z.boolean()

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

function buildStorage(): StorageAdapter {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (env.STORAGE_MODE === 's3') {
    if (
      !env.STORAGE_S3_ENDPOINT ||
      !env.STORAGE_S3_BUCKET ||
      !env.STORAGE_S3_ACCESS_KEY ||
      !env.STORAGE_S3_SECRET_KEY
    ) {
      throw new Error('STORAGE_MODE=s3 requires all STORAGE_S3_* env vars')
    }
    return createAdapter({
      mode: 's3',
      endpoint: env.STORAGE_S3_ENDPOINT,
      bucket: env.STORAGE_S3_BUCKET,
      accessKey: env.STORAGE_S3_ACCESS_KEY,
      secretKey: env.STORAGE_S3_SECRET_KEY,
      region: env.STORAGE_S3_REGION,
      forcePathStyle: true,
    })
  }
  return createAdapter({ mode: 'local', path: env.STORAGE_PATH })
}

async function getConvertSetting(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({
    where: { key: 'upload.convert_to_compatible' },
  })
  if (!row) return false
  const parsed = BoolSchema.safeParse(row.value)
  return parsed.success ? parsed.data : false
}

export async function processAsset(job: ProcessAssetJob, publisher: IORedis): Promise<void> {
  const storage = buildStorage()

  const asset = await prisma.asset.findFirst({
    where: { id: job.assetId, familyId: job.familyId },
  })
  if (!asset) {
    throw new Error(`Asset ${job.assetId} not found in family ${job.familyId}`)
  }
  if (asset.status !== 'processing') {
    logger.warn({ assetId: asset.id, status: asset.status }, 'skipping asset with non-processing status')
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

    const convertEnabled = await getConvertSetting()
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

    await publishAssetEvent(publisher, {
      type: 'asset.updated',
      familyId: asset.familyId,
      assetId: asset.id,
      status: 'ready',
      derivatives,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await prisma.asset.update({
      where: { id: asset.id, familyId: asset.familyId },
      data: { status: 'failed', processingError: message },
    })
    await publishAssetEvent(publisher, {
      type: 'asset.updated',
      familyId: asset.familyId,
      assetId: asset.id,
      status: 'failed',
    })
    throw err
  }
}
