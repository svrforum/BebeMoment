import {
  type AssetUrls,
  type HealthResponse,
  HttpMediaClient,
  type InitAssetRequest,
  type InitAssetResponse,
  type MediaClient,
  type SetBabyTagsRequest,
  type UpdateAssetMetadataRequest,
  type UpdateAssetMetadataResponse,
} from '@bebe/media-client'
import { logger } from './logger'

const globalForMedia = globalThis as unknown as { __bebeMediaClient?: MediaClient }

/**
 * Per-process LRU TTL cache for signed-URL responses.
 *
 * Why: every Server-Component render of the timeline/albums/etc. ships an
 * HTTP round trip to the media service for asset URLs the user just
 * scrolled past. Signed URLs live ~10 minutes (`expiresAt` in response),
 * so caching them for <600s is safe — we use 240s with a hard cap based
 * on the response's earliest `expiresAt`, whichever is sooner. On hit we
 * skip the HTTP call entirely. Cache lives in the Node process; a deploy
 * restart flushes it (fine — fresh URLs).
 *
 * Opt out via `MEDIA_URL_CACHE=off` (e.g. to bisect a stale-URL bug).
 */
const CACHE_TTL_MS = 240_000 // 240s, hard <600s signed-URL lifetime
const CACHE_MAX_ENTRIES = 256

type BatchKey = string
type BatchEntry = {
  expiresAt: number
  value: Record<string, AssetUrls>
}
type SingleEntry = {
  expiresAt: number
  value: AssetUrls
}

const batchCache = new Map<BatchKey, BatchEntry>()
const singleCache = new Map<string, SingleEntry>()
let hits = 0
let misses = 0

function cacheEnabled(): boolean {
  return process.env.MEDIA_URL_CACHE !== 'off'
}

function makeBatchKey(familyId: string, assetIds: string[], includeDeleted: boolean): BatchKey {
  // Sort to make order-insensitive — same set of ids = same key.
  const sorted = [...assetIds].sort()
  return `${familyId}|${includeDeleted ? '1' : '0'}|${sorted.join(',')}`
}

function evictExpired(map: Map<string, { expiresAt: number }>, now: number): void {
  for (const [k, v] of map) {
    if (v.expiresAt <= now) map.delete(k)
  }
}

function capByEntries(map: Map<string, unknown>, max: number): void {
  while (map.size > max) {
    // Map iteration order = insertion order — drop oldest.
    const first = map.keys().next()
    if (first.done) break
    map.delete(first.value)
  }
}

function earliestExpiresMs(urls: AssetUrls[]): number {
  let earliest = Number.POSITIVE_INFINITY
  for (const u of urls) {
    const t = Date.parse(u.expiresAt)
    if (Number.isFinite(t) && t < earliest) earliest = t
  }
  return earliest
}

function logCacheStats(): void {
  // Sparse debug-level: only every 100 ops to avoid log spam.
  if ((hits + misses) % 100 === 0 && hits + misses > 0) {
    const ratio = hits / (hits + misses)
    logger.debug({ hits, misses, ratio: Number(ratio.toFixed(3)) }, 'media-url cache stats')
  }
}

class CachingMediaClient implements MediaClient {
  constructor(private readonly inner: MediaClient) {}

  initAsset(input: InitAssetRequest): Promise<InitAssetResponse> {
    return this.inner.initAsset(input)
  }

  async getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls> {
    if (!cacheEnabled()) return this.inner.getAssetUrls(assetId, familyId)
    const key = `${familyId}|${assetId}`
    const now = Date.now()
    const hit = singleCache.get(key)
    if (hit && hit.expiresAt > now) {
      hits++
      logCacheStats()
      return hit.value
    }
    misses++
    const value = await this.inner.getAssetUrls(assetId, familyId)
    const expiresAt = Math.min(now + CACHE_TTL_MS, earliestExpiresMs([value]) - 5_000)
    if (expiresAt > now) {
      singleCache.set(key, { expiresAt, value })
      capByEntries(singleCache, CACHE_MAX_ENTRIES)
      if (singleCache.size > 32 && Math.random() < 0.05) evictExpired(singleCache, now)
    }
    logCacheStats()
    return value
  }

  async getAssetUrlsBatch(
    familyId: string,
    assetIds: string[],
    opts?: { includeDeleted?: boolean },
  ): Promise<Record<string, AssetUrls>> {
    if (!cacheEnabled() || assetIds.length === 0) {
      return this.inner.getAssetUrlsBatch(familyId, assetIds, opts)
    }
    const key = makeBatchKey(familyId, assetIds, opts?.includeDeleted ?? false)
    const now = Date.now()
    const hit = batchCache.get(key)
    if (hit && hit.expiresAt > now) {
      hits++
      // Re-insert to refresh LRU order.
      batchCache.delete(key)
      batchCache.set(key, hit)
      logCacheStats()
      return hit.value
    }
    misses++
    const value = await this.inner.getAssetUrlsBatch(familyId, assetIds, opts)
    const urlsArr = Object.values(value)
    const expiresAt =
      urlsArr.length > 0
        ? Math.min(now + CACHE_TTL_MS, earliestExpiresMs(urlsArr) - 5_000)
        : now + CACHE_TTL_MS
    if (expiresAt > now) {
      batchCache.set(key, { expiresAt, value })
      capByEntries(batchCache, CACHE_MAX_ENTRIES)
      if (batchCache.size > 32 && Math.random() < 0.05) evictExpired(batchCache, now)
    }
    logCacheStats()
    return value
  }

  setBabyTags(assetId: string, input: SetBabyTagsRequest): Promise<void> {
    return this.inner.setBabyTags(assetId, input)
  }

  updateAssetMetadata(
    assetId: string,
    input: UpdateAssetMetadataRequest,
  ): Promise<UpdateAssetMetadataResponse> {
    return this.inner.updateAssetMetadata(assetId, input)
  }

  deleteAsset(assetId: string, familyId: string): Promise<void> {
    return this.inner.deleteAsset(assetId, familyId)
  }

  purgeAsset(assetId: string, familyId: string): Promise<void> {
    return this.inner.purgeAsset(assetId, familyId)
  }

  retryAsset(assetId: string, familyId: string): Promise<void> {
    return this.inner.retryAsset(assetId, familyId)
  }

  health(): Promise<HealthResponse> {
    return this.inner.health()
  }
}

export function getMediaClient(): MediaClient {
  if (!globalForMedia.__bebeMediaClient) {
    const baseUrl = process.env.MEDIA_INTERNAL_URL
    const serviceToken = process.env.MEDIA_SERVICE_TOKEN
    if (!baseUrl) throw new Error('MEDIA_INTERNAL_URL env required')
    if (!serviceToken) throw new Error('MEDIA_SERVICE_TOKEN env required')
    const http = new HttpMediaClient({ baseUrl, serviceToken })
    globalForMedia.__bebeMediaClient = new CachingMediaClient(http)
  }
  return globalForMedia.__bebeMediaClient
}
