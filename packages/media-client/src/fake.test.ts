import { describe, expect, test } from 'vitest'
import { FakeMediaClient } from './fake'

describe('FakeMediaClient', () => {
  test('initAsset returns deterministic assetId and records call', async () => {
    const fake = new FakeMediaClient()
    const r = await fake.initAsset({
      familyId: '11111111-1111-1111-1111-111111111111',
      uploaderId: '22222222-2222-2222-2222-222222222222',
      mime: 'image/jpeg',
      sizeBytes: 100,
      originalName: 'a.jpg',
    })
    expect(r.assetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/)
    expect(r.tusUploadUrl).toContain('/media/v1/tus/')
    expect(fake.calls.initAsset).toHaveLength(1)
  })

  test('getAssetUrls returns null trios by default', async () => {
    const fake = new FakeMediaClient()
    const u = await fake.getAssetUrls(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    expect(u.thumb256).toBeNull()
    expect(u.blurhash).toBeNull()
  })

  test('setUrlsForAsset lets tests preset return values', async () => {
    const fake = new FakeMediaClient()
    fake.setUrlsForAsset('11111111-1111-1111-1111-111111111111', {
      blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
      dominantColor: '#ccbbaa',
      aspectRatio: 1.5,
      thumb256: {
        avif: 'https://m/256.avif', webp: 'https://m/256.webp', jpeg: 'https://m/256.jpg',
      },
      thumb512: null,
      display1080: null,
      original: null,
      videoPoster: null,
      videoCompat: null,
      expiresAt: '2026-04-24T12:00:00Z',
    })
    const u = await fake.getAssetUrls(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    expect(u.thumb256?.avif).toBe('https://m/256.avif')
  })

  test('deleteAsset records call', async () => {
    const fake = new FakeMediaClient()
    await fake.deleteAsset(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )
    expect(fake.calls.deleteAsset).toHaveLength(1)
  })

  test('health returns ready:true', async () => {
    const fake = new FakeMediaClient()
    const h = await fake.health()
    expect(h.ready).toBe(true)
  })

  test('simulateError flag makes operations throw MediaError', async () => {
    const fake = new FakeMediaClient()
    fake.simulateError('UPLOAD_TOKEN_EXPIRED', '만료됨', true)
    await expect(
      fake.getAssetUrls(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ),
    ).rejects.toThrow(/UPLOAD_TOKEN_EXPIRED/)
  })
})
