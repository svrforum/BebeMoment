import type { PrismaClient } from '@bebe/db-media'
import type { Upload } from '@tus/server'
import type { Queue } from 'bullmq'
import type pino from 'pino'
import type { UploadTokenPayload } from '@/lib/jwt'

export async function onUploadFinishMedia(args: {
  upload: Upload
  token: UploadTokenPayload
  prisma: PrismaClient
  queue: Queue
  logger: pino.Logger | pino.BaseLogger
}): Promise<void> {
  const { upload, token, prisma, queue, logger } = args

  await prisma.asset.update({
    where: { id: token.assetId, familyId: token.familyId },
    data: {
      status: 'processing',
      sizeBytes: BigInt(upload.size ?? 0),
    },
  })

  await queue.add('process-asset', {
    type: 'process-asset',
    familyId: token.familyId,
    assetId: token.assetId,
    convertToCompatible: token.convertToCompatible,
  })

  logger.info(
    { assetId: token.assetId, familyId: token.familyId, size: upload.size },
    'tus upload finished, job enqueued',
  )
}
