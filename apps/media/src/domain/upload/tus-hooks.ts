import fs from 'node:fs/promises'
import path from 'node:path'
import type { UploadTokenPayload } from '@/lib/jwt'
import { parseEnv } from '@bebe/config'
import type { PrismaClient } from '@bebe/db-media'
import type { Upload } from '@tus/server'
import type { Queue } from 'bullmq'
import type pino from 'pino'

/**
 * Move the uploaded bytes from the tus tmp directory to the final storage key
 * (`families/<familyId>/assets/<assetId>/original`). Atomic rename when same
 * filesystem; copy+unlink fallback otherwise.
 */
async function moveTusToFinal(args: { assetId: string; finalKey: string }): Promise<void> {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const tusPath = path.join(env.STORAGE_PATH, 'tus-tmp', args.assetId)
  const finalPath = path.join(env.STORAGE_PATH, args.finalKey)
  await fs.mkdir(path.dirname(finalPath), { recursive: true })
  try {
    await fs.rename(tusPath, finalPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      // Cross-device — fall back to copy + unlink
      await fs.copyFile(tusPath, finalPath)
      await fs.unlink(tusPath)
    } else {
      throw err
    }
  }
  // tus-server also writes a sidecar metadata file at `<id>.json` — remove it
  await fs.unlink(`${tusPath}.json`).catch(() => {})
}

export async function onUploadFinishMedia(args: {
  upload: Upload
  token: UploadTokenPayload
  prisma: PrismaClient
  queue: Queue
  logger: pino.Logger | pino.BaseLogger
}): Promise<void> {
  const { upload, token, prisma, queue, logger } = args

  // Resolve the asset's final storage key (set during init)
  const asset = await prisma.asset.findFirst({
    where: { id: token.assetId, familyId: token.familyId },
    select: { originalKey: true },
  })
  if (!asset) {
    throw new Error(`asset ${token.assetId} not found for family ${token.familyId}`)
  }

  // Enforce per-token size limit (web stamps maxBytes when minting the JWT).
  // Reject oversize uploads before moving bytes or enqueuing processing.
  if (token.maxBytes > 0 && (upload.size ?? 0) > token.maxBytes) {
    const message = `upload exceeds maxBytes (${upload.size ?? 0} > ${token.maxBytes})`
    await prisma.asset.update({
      where: { id: token.assetId, familyId: token.familyId },
      data: { status: 'failed', processingError: message },
    })
    logger.warn(
      {
        assetId: token.assetId,
        familyId: token.familyId,
        size: upload.size,
        maxBytes: token.maxBytes,
      },
      'tus upload rejected: maxBytes exceeded',
    )
    throw new Error(message)
  }

  await moveTusToFinal({ assetId: token.assetId, finalKey: asset.originalKey })

  await prisma.asset.update({
    where: { id: token.assetId, familyId: token.familyId },
    data: {
      status: 'processing',
      sizeBytes: BigInt(upload.size ?? 0),
    },
  })

  await queue.add(
    'process-asset',
    {
      type: 'process-asset',
      familyId: token.familyId,
      assetId: token.assetId,
      convertToCompatible: token.convertToCompatible,
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  )

  logger.info(
    { assetId: token.assetId, familyId: token.familyId, size: upload.size, key: asset.originalKey },
    'tus upload finished, file moved to final storage, job enqueued',
  )
}
