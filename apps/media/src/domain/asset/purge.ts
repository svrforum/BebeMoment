import { parseDerivativesV2 } from '@/domain/derivatives-v2'
import { getStorage } from '@/lib/storage'
import { logger } from '@/lib/logger'
import type { PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'

export type PurgeResult = {
  assetId: string
  deletedKeys: string[]
  failedKeys: { key: string; error: string }[]
}

/**
 * Collect every storage key that belongs to a (soft-deleted) asset:
 * original bytes + every derivative trio (thumb256 / thumb512 / display1080 ×
 * avif/webp/jpeg) + video poster + compat preview. Legacy v1 derivatives
 * (parseDerivativesV2 → null with poster fallback) are still picked up via
 * the parser's legacy-shape adapter.
 */
function collectKeys(asset: { originalKey: string; derivatives: unknown }): string[] {
  const keys = new Set<string>()
  keys.add(asset.originalKey)

  const d = parseDerivativesV2(asset.derivatives)
  if (d) {
    for (const tier of ['thumb256', 'thumb512', 'display1080'] as const) {
      const trio = d[tier]
      if (trio) {
        keys.add(trio.avif)
        keys.add(trio.webp)
        keys.add(trio.jpeg)
      }
    }
    if (d.videoPoster) keys.add(d.videoPoster)
    if (d.videoCompat) keys.add(d.videoCompat)
  }
  return Array.from(keys)
}

/**
 * Permanently delete a soft-deleted asset: reclaim storage bytes first, then
 * hard-delete the DB row. Errors on individual key deletes are logged and
 * tolerated so a partially-deleted asset can still be removed from the DB
 * (otherwise the family would carry an orphan row pointing to nothing).
 *
 * Refuses to operate on non-soft-deleted assets — call sites are expected
 * to soft-delete first, then purge from the trash.
 */
export async function purgeAsset(
  args: { assetId: string; familyId: string },
  prisma: PrismaClient,
  storage: StorageAdapter = getStorage(),
): Promise<PurgeResult> {
  const asset = await prisma.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId },
  })
  if (!asset) {
    throw new Error(`asset ${args.assetId} not found in this family`)
  }
  if (!asset.deletedAt) {
    throw new Error('asset is not in trash; soft-delete first before purge')
  }

  // 중복 별칭(duplicateOf=이 자산)이 살아있으면 이 자산의 originalKey·파생물 바이트를
  // 그 별칭들이 공유한다(dedup 시 canonical 키를 복사). 바이트를 지우면 스토리·앨범에
  // 있는 별칭이 깨지므로, 살아있는 별칭이 있으면 바이트는 보존하고 행만 하드삭제한다.
  const aliasCount = await prisma.asset.count({
    where: { familyId: args.familyId, duplicateOf: asset.id, deletedAt: null },
  })
  const keys = aliasCount > 0 ? [] : collectKeys(asset)
  const deletedKeys: string[] = []
  const failedKeys: { key: string; error: string }[] = []

  for (const key of keys) {
    try {
      await storage.delete(key)
      deletedKeys.push(key)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failedKeys.push({ key, error: msg })
      logger.warn(
        { assetId: args.assetId, familyId: args.familyId, key, err: msg },
        'purge: storage.delete failed, continuing',
      )
    }
  }

  // Hard-delete after bytes are gone (or at least attempted). Order matters:
  // if we dropped the row first and the storage delete blew up, the bytes
  // would be orphaned forever — no row points to them anymore.
  await prisma.asset.delete({
    where: { id: asset.id, familyId: args.familyId },
  })

  return { assetId: asset.id, deletedKeys, failedKeys }
}
