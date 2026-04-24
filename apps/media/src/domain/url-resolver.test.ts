import { beforeAll, describe, expect, test } from 'vitest'
import type { Asset } from '@bebe/db-media'
import { resolveAssetUrls } from './url-resolver'

const mkAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: '22222222-2222-2222-2222-222222222222',
  familyId: '11111111-1111-1111-1111-111111111111',
  uploadedByUserId: '33333333-3333-3333-3333-333333333333',
  kind: 'image',
  originalKey: 'families/fam/assets/asset/original',
  originalFilename: 'a.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: BigInt(100),
  sha256: ''.padEnd(64, '0'),
  width: 1920,
  height: 1080,
  durationMs: null,
  takenAt: new Date(),
  takenAtSource: 'uploaded',
  uploadedAt: new Date(),
  gpsLat: null,
  gpsLng: null,
  cameraMake: null,
  cameraModel: null,
  exifRaw: null,
  originalConvertedFrom: null,
  status: 'ready',
  processingError: null,
  derivatives: {},
  visibility: 'family',
  tags: [],
  caption: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
}) as unknown as Asset

describe('resolveAssetUrls', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://example.com'
  })

  test('returns signed original url for ready image', async () => {
    const urls = await resolveAssetUrls(mkAsset())
    expect(urls.original).toContain('/media/v1/files/')
    expect(urls.aspectRatio).toBe(1920 / 1080)
  })

  test('derivative tiers are null in Phase C-1', async () => {
    const urls = await resolveAssetUrls(mkAsset())
    expect(urls.thumb256).toBeNull()
    expect(urls.thumb512).toBeNull()
    expect(urls.display1080).toBeNull()
    expect(urls.videoPoster).toBeNull()
    expect(urls.videoCompat).toBeNull()
    expect(urls.blurhash).toBeNull()
    expect(urls.dominantColor).toBeNull()
  })

  test('aspectRatio null when width or height missing', async () => {
    const urls = await resolveAssetUrls(mkAsset({ width: null, height: null }))
    expect(urls.aspectRatio).toBeNull()
  })

  test('expiresAt is ISO-8601 Z timestamp', async () => {
    const urls = await resolveAssetUrls(mkAsset())
    expect(urls.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z$/)
  })
})
