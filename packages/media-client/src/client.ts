import {
  type AssetUrls,
  type AssetUrlTier,
  BATCH_URLS_MAX_IDS,
  type HealthResponse,
  type InitAssetRequest,
  type InitAssetResponse,
  type MediaErrorCode,
  type MintDownloadRequest,
  type SetBabyTagsRequest,
  type UpdateAssetMetadataRequest,
  type UpdateAssetMetadataResponse,
  assetUrls as assetUrlsSchema,
  batchUrlsResponse,
  errorResponse,
  getAssetUrlsResponse,
  healthResponse,
  initAssetResponse,
  mintDownloadResponse,
  unrecoverableResponse,
  updateAssetMetadataResponse,
} from './schemas'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type BatchUrlsOptions = {
  includeDeleted?: boolean
  /** 필요한 티어만. 생략하면 전 티어(기존 동작). 지정한 티어 외에는 서명되지 않고 null. */
  tiers?: AssetUrlTier[]
}

export type MediaClientConfig = {
  baseUrl: string
  serviceToken: string
  fetch?: FetchLike
}

export interface MediaClient {
  initAsset(input: InitAssetRequest): Promise<InitAssetResponse>
  getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls>
  getAssetUrlsBatch(
    familyId: string,
    assetIds: string[],
    opts?: BatchUrlsOptions,
  ): Promise<Record<string, AssetUrls>>
  setBabyTags(assetId: string, input: SetBabyTagsRequest): Promise<void>
  updateAssetMetadata(
    assetId: string,
    input: UpdateAssetMetadataRequest,
  ): Promise<UpdateAssetMetadataResponse>
  deleteAsset(assetId: string, familyId: string): Promise<void>
  purgeAsset(assetId: string, familyId: string): Promise<void>
  unrecoverableAssetIds(familyId: string): Promise<string[]>
  retryAsset(assetId: string, familyId: string): Promise<void>
  mintDownloadUrl(input: MintDownloadRequest): Promise<string>
  health(): Promise<HealthResponse>
}

const BATCH_URLS_CONCURRENCY = 4

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i] as T)
    }
  })
  await Promise.all(workers)
  return out
}

export class MediaError extends Error {
  readonly code: MediaErrorCode | string
  readonly retriable: boolean
  readonly details?: Record<string, unknown>
  constructor(
    code: string,
    message: string,
    retriable: boolean,
    details?: Record<string, unknown>,
  ) {
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
        // 본문이 있을 때만 붙인다 — 본문 없는 POST 에 application/json 을 선언하면
        // Fastify 가 FST_ERR_CTP_EMPTY_JSON_BODY 로 거절한다(휴지통 영구삭제가 통째로
        // 500 이던 원인. DELETE 는 본문을 기대하지 않아 드러나지 않았다).
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
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
    return this.request(
      '/media/v1/assets/init',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      (b) => initAssetResponse.parse(b),
    )
  }

  async getAssetUrls(assetId: string, familyId: string): Promise<AssetUrls> {
    return this.request(
      `/media/v1/assets/${assetId}/urls?familyId=${familyId}`,
      { method: 'GET' },
      (b) => getAssetUrlsResponse.parse(b).urls,
    )
  }

  // 서버 스키마는 한 요청에 BATCH_URLS_MAX_IDS 개까지만 받는데 호출부(뷰어 이웃 500·인물
  // 500·추억/날짜 공유 무제한)는 그보다 많이 보냈다 — ZodError 400 → MediaError → 페이지
  // 500. 여기서 잘라 병렬(최대 4)로 묻고 입력 순서대로 합친다. 중복 id 는 한 번만.
  async getAssetUrlsBatch(
    familyId: string,
    assetIds: string[],
    opts?: BatchUrlsOptions,
  ): Promise<Record<string, AssetUrls>> {
    const ids = Array.from(new Set(assetIds))
    if (ids.length === 0) return {}
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += BATCH_URLS_MAX_IDS) {
      chunks.push(ids.slice(i, i + BATCH_URLS_MAX_IDS))
    }
    const parts = await mapConcurrent(chunks, BATCH_URLS_CONCURRENCY, (chunk) =>
      this.request(
        '/media/v1/assets/urls:batch',
        {
          method: 'POST',
          body: JSON.stringify({
            familyId,
            assetIds: chunk,
            includeDeleted: opts?.includeDeleted,
            ...(opts?.tiers ? { tiers: opts.tiers } : {}),
          }),
        },
        (b) => batchUrlsResponse.parse(b).urls,
      ),
    )
    const out: Record<string, AssetUrls> = {}
    for (const part of parts) Object.assign(out, part)
    return out
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

  async purgeAsset(assetId: string, familyId: string): Promise<void> {
    // Google-style action: literal `:purge` suffix on the id segment, no
    // url-encoding — colons are valid in path segments per RFC 3986.
    await this.request(
      `/media/v1/assets/${assetId}:purge?familyId=${familyId}`,
      { method: 'POST' },
      () => undefined,
    )
  }

  async unrecoverableAssetIds(familyId: string): Promise<string[]> {
    return this.request(
      `/media/v1/assets/unrecoverable?familyId=${familyId}`,
      { method: 'GET' },
      (b) => unrecoverableResponse.parse(b).assetIds,
    )
  }

  async retryAsset(assetId: string, familyId: string): Promise<void> {
    await this.request(
      `/media/v1/assets/${assetId}/retry`,
      { method: 'POST', body: JSON.stringify({ familyId }) },
      () => undefined,
    )
  }

  async mintDownloadUrl(input: MintDownloadRequest): Promise<string> {
    return this.request(
      '/media/v1/download/mint',
      { method: 'POST', body: JSON.stringify(input) },
      (b) => mintDownloadResponse.parse(b).url,
    )
  }

  async health(): Promise<HealthResponse> {
    return this.request('/media/v1/health', { method: 'GET' }, (b) => healthResponse.parse(b))
  }
}

export { assetUrlsSchema }
