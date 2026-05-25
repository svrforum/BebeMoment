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
