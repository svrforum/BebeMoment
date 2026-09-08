import type { BatchUrlsOptions } from './client'
import { type MediaClient, MediaError } from './client'
import type {
  AssetUrlTier,
  AssetUrls,
  HealthResponse,
  InitAssetRequest,
  InitAssetResponse,
  MediaErrorCode,
  MintDownloadRequest,
  SetBabyTagsRequest,
} from './schemas'
import { assetUrls as assetUrlsSchema } from './schemas'

type Calls = {
  initAsset: InitAssetRequest[]
  getAssetUrls: { assetId: string; familyId: string }[]
  getAssetUrlsBatch: { familyId: string; assetIds: string[]; tiers?: AssetUrlTier[] }[]
  setBabyTags: { assetId: string; input: SetBabyTagsRequest }[]
  deleteAsset: { assetId: string; familyId: string }[]
  purgeAsset: { assetId: string; familyId: string }[]
  retryAsset: { assetId: string; familyId: string }[]
  mintDownloadUrl: MintDownloadRequest[]
}

function emptyUrls(): AssetUrls {
  return {
    blurhash: null,
    dominantColor: null,
    aspectRatio: null,
    thumb256: null,
    thumb512: null,
    display1080: null,
    original: null,
    videoPoster: null,
    videoCompat: null,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
}

function restrictToTiers(urls: AssetUrls, tiers: AssetUrlTier[] | undefined): AssetUrls {
  if (!tiers) return urls
  const want = (t: AssetUrlTier) => tiers.includes(t)
  // 서버와 같은 규칙 — 파생물이 하나도 없는(레거시·처리중) 자산은 원본이 유일한 표시
  // 경로라 티어를 좁혀도 원본만은 남긴다.
  const hasDerivative =
    urls.thumb256 !== null ||
    urls.thumb512 !== null ||
    urls.display1080 !== null ||
    urls.videoPoster !== null ||
    urls.videoCompat !== null
  return {
    ...urls,
    thumb256: want('thumb') ? urls.thumb256 : null,
    thumb512: want('thumb') ? urls.thumb512 : null,
    display1080: want('display') ? urls.display1080 : null,
    original: want('original') || !hasDerivative ? urls.original : null,
    videoPoster: want('video') ? urls.videoPoster : null,
    videoCompat: want('video') ? urls.videoCompat : null,
  }
}

export class FakeMediaClient implements MediaClient {
  readonly calls: Calls = {
    initAsset: [],
    getAssetUrls: [],
    getAssetUrlsBatch: [],
    setBabyTags: [],
    deleteAsset: [],
    purgeAsset: [],
    retryAsset: [],
    mintDownloadUrl: [],
  }

  private urlsByAsset = new Map<string, AssetUrls>()
  private simulated?: { code: MediaErrorCode | string; message: string; retriable: boolean }

  setUrlsForAsset(assetId: string, urls: AssetUrls): void {
    assetUrlsSchema.parse(urls)
    this.urlsByAsset.set(assetId, urls)
  }

  simulateError(code: MediaErrorCode | string, message: string, retriable: boolean): void {
    this.simulated = { code, message, retriable }
  }

  clearSimulatedError(): void {
    delete this.simulated
  }

  private maybeThrow(): void {
    if (this.simulated) {
      throw new MediaError(this.simulated.code, this.simulated.message, this.simulated.retriable)
    }
  }

  async initAsset(input: InitAssetRequest): Promise<InitAssetResponse> {
    this.maybeThrow()
    this.calls.initAsset.push(input)
    const assetId = crypto.randomUUID()
    return {
      v: 1,
      assetId,
      tusUploadUrl: `http://media.fake/media/v1/tus/${assetId}`,
      uploadToken: `fake-token-${assetId}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    }
  }

  async getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls> {
    this.maybeThrow()
    this.calls.getAssetUrls.push({ assetId, familyId })
    return this.urlsByAsset.get(assetId) ?? emptyUrls()
  }

  async getAssetUrlsBatch(
    familyId: string,
    assetIds: string[],
    opts?: BatchUrlsOptions,
  ): Promise<Record<string, AssetUrls>> {
    this.maybeThrow()
    this.calls.getAssetUrlsBatch.push({
      familyId,
      assetIds,
      ...(opts?.tiers ? { tiers: opts.tiers } : {}),
    })
    const out: Record<string, AssetUrls> = {}
    // 실제 서버처럼 요청하지 않은 티어는 null 로 지운다 — 티어를 좁힌 호출부가 지우고
    // 나서도 쓰는 필드가 있으면 테스트에서 바로 드러난다.
    for (const id of assetIds) {
      out[id] = restrictToTiers(this.urlsByAsset.get(id) ?? emptyUrls(), opts?.tiers)
    }
    return out
  }

  async setBabyTags(assetId: string, input: SetBabyTagsRequest): Promise<void> {
    this.maybeThrow()
    this.calls.setBabyTags.push({ assetId, input })
  }

  async updateAssetMetadata(
    _assetId: string,
    input: import('./schemas').UpdateAssetMetadataRequest,
  ): Promise<import('./schemas').UpdateAssetMetadataResponse> {
    this.maybeThrow()
    return {
      v: 1,
      filename: input.filename ?? 'fake.jpg',
      caption: input.caption ?? null,
      takenAt: input.takenAt ?? new Date().toISOString(),
      takenAtSource: input.takenAt ? 'manual' : 'uploaded',
    }
  }

  async deleteAsset(assetId: string, familyId: string): Promise<void> {
    this.maybeThrow()
    this.calls.deleteAsset.push({ assetId, familyId })
  }

  async purgeAsset(assetId: string, familyId: string): Promise<void> {
    this.maybeThrow()
    this.calls.purgeAsset.push({ assetId, familyId })
  }

  async unrecoverableAssetIds(_familyId: string): Promise<string[]> {
    return []
  }

  async retryAsset(assetId: string, familyId: string): Promise<void> {
    this.maybeThrow()
    this.calls.retryAsset.push({ assetId, familyId })
  }

  async mintDownloadUrl(input: MintDownloadRequest): Promise<string> {
    this.maybeThrow()
    this.calls.mintDownloadUrl.push(input)
    return `https://fake.local/download/${input.assetId}/${input.quality}`
  }

  async health(): Promise<HealthResponse> {
    this.maybeThrow()
    return { v: 1, version: '0.0.0-fake', minWebVersion: '0.0.0', ready: true }
  }
}
