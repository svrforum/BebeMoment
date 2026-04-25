import {
  type AssetUrls,
  type HealthResponse,
  type InitAssetRequest,
  type InitAssetResponse,
  type MediaErrorCode,
  type SetBabyTagsRequest,
  type UpdateAssetMetadataRequest,
  type UpdateAssetMetadataResponse,
  assetUrls as assetUrlsSchema,
  batchUrlsResponse,
  errorResponse,
  getAssetUrlsResponse,
  healthResponse,
  initAssetResponse,
  updateAssetMetadataResponse,
} from './schemas'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type MediaClientConfig = {
  baseUrl: string
  serviceToken: string
  fetch?: FetchLike
}

export interface MediaClient {
  initAsset(input: InitAssetRequest): Promise<InitAssetResponse>
  getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls>
  getAssetUrlsBatch(familyId: string, assetIds: string[]): Promise<Record<string, AssetUrls>>
  setBabyTags(assetId: string, input: SetBabyTagsRequest): Promise<void>
  updateAssetMetadata(
    assetId: string,
    input: UpdateAssetMetadataRequest,
  ): Promise<UpdateAssetMetadataResponse>
  deleteAsset(assetId: string, familyId: string): Promise<void>
  retryAsset(assetId: string, familyId: string): Promise<void>
  health(): Promise<HealthResponse>
}

export class MediaError extends Error {
  readonly code: MediaErrorCode | string
  readonly retriable: boolean
  readonly details?: Record<string, unknown>
  constructor(code: string, message: string, retriable: boolean, details?: Record<string, unknown>) {
    super(`[${code}] ${message}`)
    this.code = code
    this.retriable = retriable
    if (details !== undefined) this.details = details
  }
}

export class HttpMediaClient implements MediaClient {
  private readonly baseUrl: string
  private readonly serviceToken: string
  private readonly fetchImpl: FetchLike

  constructor(cfg: MediaClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '')
    this.serviceToken = cfg.serviceToken
    this.fetchImpl = cfg.fetch ?? ((input, init) => fetch(input, init))
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    parser: (raw: unknown) => T,
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.serviceToken}`,
        'content-type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const text = await res.text()
    const body = text ? (JSON.parse(text) as unknown) : null
    if (!res.ok) {
      const parsed = errorResponse.safeParse(body)
      if (parsed.success) {
        throw new MediaError(
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.retriable,
          parsed.data.error.details,
        )
      }
      throw new MediaError('INTERNAL', `HTTP ${res.status}`, false, { raw: text })
    }
    return parser(body)
  }

  async initAsset(input: InitAssetRequest): Promise<InitAssetResponse> {
    return this.request('/media/v1/assets/init', {
      method: 'POST',
      body: JSON.stringify(input),
    }, (b) => initAssetResponse.parse(b))
  }

  async getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls> {
    return this.request(
      `/media/v1/assets/${assetId}/urls?familyId=${familyId}`,
      { method: 'GET' },
      (b) => getAssetUrlsResponse.parse(b).urls,
    )
  }

  async getAssetUrlsBatch(familyId: string, assetIds: string[]): Promise<Record<string, AssetUrls>> {
    return this.request(
      '/media/v1/assets/urls:batch',
      { method: 'POST', body: JSON.stringify({ familyId, assetIds }) },
      (b) => batchUrlsResponse.parse(b).urls,
    )
  }

  async setBabyTags(assetId: string, input: SetBabyTagsRequest): Promise<void> {
    await this.request(
      `/media/v1/assets/${assetId}/babies`,
      { method: 'PATCH', body: JSON.stringify(input) },
      () => undefined,
    )
  }

  async updateAssetMetadata(
    assetId: string,
    input: UpdateAssetMetadataRequest,
  ): Promise<UpdateAssetMetadataResponse> {
    return this.request(
      `/media/v1/assets/${assetId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      (b) => updateAssetMetadataResponse.parse(b),
    )
  }

  async deleteAsset(assetId: string, familyId: string): Promise<void> {
    await this.request(
      `/media/v1/assets/${assetId}?familyId=${familyId}`,
      { method: 'DELETE' },
      () => undefined,
    )
  }

  async retryAsset(assetId: string, familyId: string): Promise<void> {
    await this.request(
      `/media/v1/assets/${assetId}/retry`,
      { method: 'POST', body: JSON.stringify({ familyId }) },
      () => undefined,
    )
  }

  async health(): Promise<HealthResponse> {
    return this.request('/media/v1/health', { method: 'GET' }, (b) => healthResponse.parse(b))
  }
}

export { assetUrlsSchema }
