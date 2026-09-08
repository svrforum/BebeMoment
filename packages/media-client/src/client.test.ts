import { describe, expect, test, vi } from 'vitest'
import { HttpMediaClient } from './client'

describe('HttpMediaClient', () => {
  test('initAsset posts to /media/v1/assets/init with service token', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            v: 1,
            assetId: '11111111-1111-1111-1111-111111111111',
            tusUploadUrl: 'https://media.test/tus/abc',
            uploadToken: 'tok',
            expiresAt: '2026-04-24T12:00:00Z',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    )
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 'service-secret',
      fetch: fetchSpy,
    })
    const result = await client.initAsset({
      familyId: '11111111-1111-1111-1111-111111111111',
      uploaderId: '22222222-2222-2222-2222-222222222222',
      mime: 'image/jpeg',
      sizeBytes: 10,
      originalName: 'a.jpg',
    })
    expect(result.assetId).toBe('11111111-1111-1111-1111-111111111111')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://media.test/media/v1/assets/init',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer service-secret',
          'content-type': 'application/json',
        }),
      }),
    )
  })

  test('initAsset throws MediaError on 4xx', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'SIZE_LIMIT_EXCEEDED', message: '너무 큼', retriable: false },
          }),
          { status: 413, headers: { 'content-type': 'application/json' } },
        ),
    )
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 's',
      fetch: fetchSpy,
    })
    await expect(
      client.initAsset({
        familyId: '11111111-1111-1111-1111-111111111111',
        uploaderId: '22222222-2222-2222-2222-222222222222',
        mime: 'image/jpeg',
        sizeBytes: 999_999_999_999,
        originalName: 'big.jpg',
      }),
    ).rejects.toThrow(/SIZE_LIMIT_EXCEEDED/)
  })

  test('initAsset rejects malformed response (zod)', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ hello: 'world' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 's',
      fetch: fetchSpy,
    })
    await expect(
      client.initAsset({
        familyId: '11111111-1111-1111-1111-111111111111',
        uploaderId: '22222222-2222-2222-2222-222222222222',
        mime: 'image/jpeg',
        sizeBytes: 10,
        originalName: 'a.jpg',
      }),
    ).rejects.toThrow()
  })

  test('getAssetUrls GET with familyId query', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            v: 1,
            urls: {
              blurhash: null,
              dominantColor: null,
              aspectRatio: null,
              thumb256: null,
              thumb512: null,
              display1080: null,
              original: null,
              videoPoster: null,
              videoCompat: null,
              expiresAt: '2026-04-24T12:00:00Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 's',
      fetch: fetchSpy,
    })
    await client.getAssetUrls(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/media\/v1\/assets\/11111111-1111-1111-1111-111111111111\/urls\?familyId=22222222-2222-2222-2222-222222222222/,
      ),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  test('health returns parsed response', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ v: 1, version: '0.1.0', minWebVersion: '0.1.0', ready: true }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    )
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 's',
      fetch: fetchSpy,
    })
    const h = await client.health()
    expect(h.ready).toBe(true)
    expect(h.version).toBe('0.1.0')
  })
})

describe('getAssetUrlsBatch 청킹', () => {
  const familyId = '22222222-2222-4222-8222-222222222222'
  const uuidAt = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  const urlsFor = () => ({
    blurhash: null,
    dominantColor: null,
    aspectRatio: null,
    thumb256: null,
    thumb512: null,
    display1080: null,
    original: null,
    videoPoster: null,
    videoCompat: null,
    expiresAt: '2026-04-24T12:00:00Z',
  })

  function batchServer(opts: { delayMs?: number } = {}) {
    const requests: string[][] = []
    const bodies: Record<string, unknown>[] = []
    let inflight = 0
    let maxInflight = 0
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { assetIds: string[] }
      bodies.push(body as Record<string, unknown>)
      requests.push(body.assetIds)
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      inflight -= 1
      return new Response(
        JSON.stringify({
          v: 1,
          urls: Object.fromEntries(body.assetIds.map((id) => [id, urlsFor()])),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    const client = new HttpMediaClient({
      baseUrl: 'https://media.test',
      serviceToken: 's',
      fetch: fetchSpy,
    })
    return { client, requests, bodies, maxInflight: () => maxInflight }
  }

  // 서버 스키마가 200개로 자르는데 호출부는 500개(뷰어 이웃·인물)나 무제한(추억·날짜
  // 공유)을 보냈다 — ZodError 400 → MediaError → 페이지 500.
  test('450개 → 200/200/50 세 요청, 결과는 입력 순서대로 합쳐진다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => uuidAt(i))
    const { client, requests } = batchServer()
    const out = await client.getAssetUrlsBatch(familyId, ids)
    expect(requests.map((r) => r.length)).toEqual([200, 200, 50])
    expect(requests.flat()).toEqual(ids)
    expect(Object.keys(out)).toEqual(ids)
  })

  test('동시 요청은 4개까지', async () => {
    const ids = Array.from({ length: 1800 }, (_, i) => uuidAt(i))
    const { client, requests, maxInflight } = batchServer({ delayMs: 5 })
    await client.getAssetUrlsBatch(familyId, ids)
    expect(requests).toHaveLength(9)
    expect(maxInflight()).toBe(4)
  })

  test('tiers 를 주면 모든 청크의 본문에 그대로 실린다', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuidAt(i))
    const { client, bodies } = batchServer()
    await client.getAssetUrlsBatch(familyId, ids, { tiers: ['thumb', 'video'] })
    expect(bodies).toHaveLength(2)
    for (const b of bodies) expect(b.tiers).toEqual(['thumb', 'video'])
  })

  test('tiers 를 안 주면 본문에 tiers 키가 없다 — 서버 기본(전 티어) 유지', async () => {
    const { client, bodies } = batchServer()
    await client.getAssetUrlsBatch(familyId, [uuidAt(1)])
    expect(bodies[0]).not.toHaveProperty('tiers')
  })

  test('중복 id 는 한 번만 묻고, 빈 목록은 요청하지 않는다', async () => {
    const { client, requests } = batchServer()
    const out = await client.getAssetUrlsBatch(familyId, [uuidAt(1), uuidAt(1), uuidAt(2)])
    expect(requests).toEqual([[uuidAt(1), uuidAt(2)]])
    expect(Object.keys(out)).toEqual([uuidAt(1), uuidAt(2)])
    expect(await client.getAssetUrlsBatch(familyId, [])).toEqual({})
    expect(requests).toHaveLength(1)
  })
})

describe('본문 없는 요청의 content-type', () => {
  function spyClient() {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('', { status: 200 }),
    )
    return {
      fetchSpy,
      client: new HttpMediaClient({
        baseUrl: 'https://media.test',
        serviceToken: 'service-secret',
        fetch: fetchSpy,
      }),
    }
  }

  // 휴지통 영구삭제가 통째로 500 이던 원인: 본문 없는 POST 에 application/json 을 붙이면
  // Fastify 가 FST_ERR_CTP_EMPTY_JSON_BODY 로 거절한다.
  test('purgeAsset 은 본문이 없으니 content-type 을 붙이지 않는다', async () => {
    const { client, fetchSpy } = spyClient()
    await client.purgeAsset(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(init?.body).toBeUndefined()
    expect(headers['content-type']).toBeUndefined()
    expect(headers.authorization).toBe('Bearer service-secret')
  })

  test('본문이 있으면 그대로 content-type 을 붙인다', async () => {
    const { client, fetchSpy } = spyClient()
    await client.retryAsset(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
  })
})
