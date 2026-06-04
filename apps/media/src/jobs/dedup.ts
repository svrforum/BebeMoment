import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'
import type pino from 'pino'
import type { ProgressEvent } from '../progress/channel'

type AssetRow = NonNullable<Awaited<ReturnType<PrismaClient['asset']['findFirst']>>>

// Stream-hash so multi-hundred-MB videos don't get buffered into memory
// (Synology ARM NAS RAM is tight). The image branch separately collects bytes
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

export type DedupArgs = {
  asset: AssetRow
  prisma: PrismaClient
  storage: StorageAdapter
  publishProgress: (event: ProgressEvent) => Promise<void>
  logger: pino.Logger
}

/**
 * SHA256 dedup. initAsset wrote a random placeholder to satisfy
 * @@unique([familyId, sha256]); replace with the real digest now. On P2002 a
 * same-family duplicate already exists → discard the freshly uploaded bytes and
 * either alias this asset to the existing ready canonical or mark it failed.
 *
 * Returns `'handled'` when the asset was a duplicate and the caller must stop
 * (no derivative generation); `'continue'` to proceed normally.
 */
export async function applyDedup(args: DedupArgs): Promise<'handled' | 'continue'> {
  const { asset, prisma, storage, publishProgress, logger } = args
  if (asset.kind !== 'image' && asset.kind !== 'video') return 'continue'

  const sha256 = await streamSha256(await storage.read(asset.originalKey))
  try {
    await prisma.asset.update({
      where: { id: asset.id, familyId: asset.familyId },
      data: { sha256 },
    })
    return 'continue'
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
    if (existing) {
      // 살아있는 ready 원본과 진짜 중복 — 새로 올린 바이트는 버리고 별칭으로.
      try {
        await storage.delete(asset.originalKey)
      } catch (delErr) {
        logger.warn({ assetId: asset.id, err: delErr }, 'failed to delete duplicate upload bytes')
      }
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
      return 'handled'
    }
    // 살아있는 ready 원본이 없다. 충돌 상대가 "소프트 삭제된" 자산이면 — 사용자가 지웠던
    // 사진을 다시 올린 것이라 dedup 슬롯만 점유 중 — 그 슬롯을 비우고 이 업로드를 새 자산으로
    // 정상 진행한다(바이트 유지). 삭제된 원본은 그대로 삭제 상태(타임라인 부활 안 함).
    const colliding = await prisma.asset.findFirst({
      where: { familyId: asset.familyId, sha256, NOT: { id: asset.id } },
    })
    if (colliding?.deletedAt) {
      await prisma.asset.update({
        where: { id: colliding.id, familyId: asset.familyId },
        data: { sha256: randomBytes(32).toString('hex') },
      })
      await prisma.asset.update({
        where: { id: asset.id, familyId: asset.familyId },
        data: { sha256 },
      })
      logger.info(
        { assetId: asset.id, reclaimedFrom: colliding.id, familyId: asset.familyId },
        'duplicate of a soft-deleted asset — reclaiming dedup slot, processing as new',
      )
      return 'continue'
    }
    // 진짜로 ready canonical 이 없다(예: 동시 업로드 경쟁) — 새 바이트 버리고 실패 처리.
    try {
      await storage.delete(asset.originalKey)
    } catch (delErr) {
      logger.warn({ assetId: asset.id, err: delErr }, 'failed to delete duplicate upload bytes')
    }
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
    return 'handled'
  }
}
