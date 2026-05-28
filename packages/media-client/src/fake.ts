import { randomUUID } from 'node:crypto'
import { type MediaClient, MediaError } from './client'
import type {
  AssetUrls,
  HealthResponse,
  InitAssetRequest,
  InitAssetResponse,
  MediaErrorCode,
  SetBabyTagsRequest,
} from './schemas'
import { assetUrls as assetUrlsSchema } from './schemas'

type Calls = {
  initAsset: InitAssetRequest[]
  getAssetUrls: { assetId: string; familyId: string }[]
  getAssetUrlsBatch: { familyId: string; assetIds: string[] }[]
  setBabyTags: { assetId: string; input: SetBabyTagsRequest }[]
  deleteAsset: { assetId: string; familyId: string }[]
  retryAsset: { assetId: string; familyId: string }[]
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

export class FakeMediaClient implements MediaClient {
  readonly calls: Calls = {
    initAsset: [],
    getAssetUrls: [],
    getAssetUrlsBatch: [],
    setBabyTags: [],
    deleteAsset: [],
    retryAsset: [],
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
    // biome-ignore lint/performance/noDelete: exactOptionalPropertyTypes forbids `= undefined`; delete is the correct reset here
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
    const assetId = randomUUID()
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
    _opts?: { includeDeleted?: boolean },
  ): Promise<Record<string, AssetUrls>> {
    this.maybeThrow()
    this.calls.getAssetUrlsBatch.push({ familyId, assetIds })
    const out: Record<string, AssetUrls> = {}
    for (const id of assetIds) out[id] = this.urlsByAsset.get(id) ?? emptyUrls()
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

  async retryAsset(assetId: string, familyId: string): Promise<void> {
    this.maybeThrow()
    this.calls.retryAsset.push({ assetId, familyId })
  }

  async health(): Promise<HealthResponse> {
    this.maybeThrow()
    return { v: 1, version: '0.0.0-fake', minWebVersion: '0.0.0', ready: true }
  }
}
