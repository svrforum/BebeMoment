import { describe, expect, test } from 'vitest'
import {
  VERSION,
  assetUrls,
  batchUrlsRequest,
  batchUrlsResponse,
  errorResponse,
  initAssetRequest,
  initAssetResponse,
  setBabyTagsRequest,
} from './schemas'

describe('media-client schemas', () => {
  test('VERSION is 1', () => {
    expect(VERSION).toBe(1)
  })

  test('initAssetRequest accepts valid payload', () => {
    const parsed = initAssetRequest.parse({
      familyId: '11111111-1111-1111-1111-111111111111',
      uploaderId: '22222222-2222-2222-2222-222222222222',
      mime: 'image/jpeg',
      sizeBytes: 12345,
      originalName: 'photo.jpg',
      clientBlurhash: 'LKN]Rv%2Tw=w]~RBVZRi};RPxuwH',
      clientAspectRatio: 1.5,
    })
    expect(parsed.sizeBytes).toBe(12345)
  })

  test('initAssetRequest defaults convertToCompatible to false', () => {
    const parsed = initAssetRequest.parse({
      familyId: '11111111-1111-1111-1111-111111111111',
      uploaderId: '22222222-2222-2222-2222-222222222222',
      mime: 'image/jpeg',
      sizeBytes: 1,
      originalName: 'a.jpg',
    })
    expect(parsed.convertToCompatible).toBe(false)
  })

  test('initAssetRequest accepts convertToCompatible=true', () => {
    const parsed = initAssetRequest.parse({
      familyId: '11111111-1111-1111-1111-111111111111',
      uploaderId: '22222222-2222-2222-2222-222222222222',
      mime: 'image/heic',
      sizeBytes: 1,
      originalName: 'a.heic',
      convertToCompatible: true,
    })
    expect(parsed.convertToCompatible).toBe(true)
  })

  test('initAssetRequest rejects negative sizeBytes', () => {
    expect(() =>
      initAssetRequest.parse({
        familyId: '11111111-1111-1111-1111-111111111111',
        uploaderId: '22222222-2222-2222-2222-222222222222',
        mime: 'image/jpeg',
        sizeBytes: -1,
        originalName: 'photo.jpg',
      }),
    ).toThrow()
  })

  test('initAssetResponse requires v=1', () => {
    expect(() =>
      initAssetResponse.parse({
        v: 2,
        assetId: '11111111-1111-1111-1111-111111111111',
        tusUploadUrl: 'https://media.example.com/tus/abc',
        uploadToken: 'token',
        expiresAt: '2026-04-24T12:00:00Z',
      }),
    ).toThrow()
  })

  test('assetUrls allows nullable derivative entries', () => {
    const parsed = assetUrls.parse({
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
    expect(parsed.blurhash).toBeNull()
  })

  test('batchUrlsRequest max 200 assetIds', () => {
    const ids = Array.from({ length: 201 }, () => '11111111-1111-1111-1111-111111111111')
    expect(() =>
      batchUrlsRequest.parse({ familyId: '22222222-2222-2222-2222-222222222222', assetIds: ids }),
    ).toThrow()
  })

  test('batchUrlsResponse wraps map of asset urls', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const parsed = batchUrlsResponse.parse({
      v: 1,
      urls: {
        [id]: {
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
      },
    })
    expect(parsed.urls[id]).toBeDefined()
  })

  test('setBabyTagsRequest validates uuid list', () => {
    expect(() => setBabyTagsRequest.parse({ familyId: 'not-uuid', babyIds: [] })).toThrow()
    const parsed = setBabyTagsRequest.parse({
      familyId: '11111111-1111-1111-1111-111111111111',
      babyIds: ['22222222-2222-2222-2222-222222222222'],
    })
    expect(parsed.babyIds).toHaveLength(1)
  })

  test('errorResponse code is machine-readable', () => {
    const parsed = errorResponse.parse({
      error: {
        code: 'UPLOAD_TOKEN_EXPIRED',
        message: '업로드 토큰이 만료됐어요',
        retriable: true,
      },
    })
    expect(parsed.error.code).toBe('UPLOAD_TOKEN_EXPIRED')
  })
})
