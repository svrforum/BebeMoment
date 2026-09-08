import type { Asset } from '@bebe/db-media'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { buildSignedUrl } from './signed-url'
import { resolveAssetUrls } from './url-resolver'

vi.mock('./signed-url', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./signed-url')>()
  return { ...mod, buildSignedUrl: vi.fn(mod.buildSignedUrl) }
})

const mkAsset = (overrides: Partial<Asset> = {}): Asset =>
  ({
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
    blurhash: null,
    dominantColor: null,
    aspectRatioCached: null,
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

  test('populates derivative tiers when derivatives v2 present', async () => {
    const urls = await resolveAssetUrls(
      mkAsset({
        derivatives: {
          v: 2,
          thumb256: { avif: 'a256', webp: 'w256', jpeg: 'j256' },
          thumb512: { avif: 'a512', webp: 'w512', jpeg: 'j512' },
          display1080: { avif: 'a1080', webp: 'w1080', jpeg: 'j1080' },
        },
      } as unknown as Partial<Asset>),
    )
    expect(urls.thumb256?.avif).toContain('/media/v1/files/')
    expect(urls.thumb256?.webp).toContain('/media/v1/files/')
    expect(urls.thumb256?.jpeg).toContain('/media/v1/files/')
    expect(urls.thumb512?.jpeg).toContain('/media/v1/files/')
    expect(urls.display1080?.avif).toContain('/media/v1/files/')
  })

  test('signs each distinct key once and reuses it for the avif slot when AVIF is disabled', async () => {
    // With MEDIA_DERIVATIVES_INCLUDE_AVIF=false the worker stores the webp key in the
    // avif slot; the resolver used to sign that key a second time for every tier.
    vi.mocked(buildSignedUrl).mockClear()
    const urls = await resolveAssetUrls(
      mkAsset({
        derivatives: {
          v: 2,
          thumb256: { avif: 'w256', webp: 'w256', jpeg: 'j256' },
          thumb512: { avif: 'w512', webp: 'w512', jpeg: 'j512' },
          display1080: { avif: 'w1080', webp: 'w1080', jpeg: 'j1080' },
        },
      } as unknown as Partial<Asset>),
    )
    expect(urls.thumb256?.avif).toBe(urls.thumb256?.webp)
    expect(urls.display1080?.avif).toBe(urls.display1080?.webp)
    const signedKeys = vi.mocked(buildSignedUrl).mock.calls.map(([args]) => args.key)
    expect(signedKeys.length).toBe(new Set(signedKeys).size)
    expect(signedKeys.length).toBe(7)
  })

  const modern = () =>
    mkAsset({
      derivatives: {
        v: 2,
        thumb256: { avif: 'a256', webp: 'w256', jpeg: 'j256' },
        thumb512: { avif: 'a512', webp: 'w512', jpeg: 'j512' },
        display1080: { avif: 'a1080', webp: 'w1080', jpeg: 'j1080' },
      },
    } as unknown as Partial<Asset>)

  test('no tiers argument signs exactly what it signs today', async () => {
    vi.mocked(buildSignedUrl).mockClear()
    const urls = await resolveAssetUrls(modern())
    // original + thumb256×3 + thumb512×3 + display1080×3
    expect(vi.mocked(buildSignedUrl).mock.calls).toHaveLength(10)
    expect(urls.original).toContain('/media/v1/files/')
    expect(urls.display1080).not.toBeNull()
  })

  test('tiers=[thumb] signs only the two thumb trios and nulls the rest', async () => {
    vi.mocked(buildSignedUrl).mockClear()
    const urls = await resolveAssetUrls(modern(), { tiers: ['thumb'] })
    const keys = vi.mocked(buildSignedUrl).mock.calls.map(([args]) => args.key)
    expect(keys.sort()).toEqual(['a256', 'a512', 'j256', 'j512', 'w256', 'w512'])
    expect(urls.thumb256?.jpeg).toContain('/media/v1/files/')
    expect(urls.thumb512?.jpeg).toContain('/media/v1/files/')
    expect(urls.display1080).toBeNull()
    expect(urls.original).toBeNull()
    // 메타데이터는 티어와 무관하게 항상 실린다 — 그리드 placeholder 가 이걸로 그려진다.
    expect(urls.aspectRatio).toBe(1920 / 1080)
    expect(urls.expiresAt).toMatch(/Z$/)
  })

  test('tiers=[video] signs poster and compat only', async () => {
    vi.mocked(buildSignedUrl).mockClear()
    const urls = await resolveAssetUrls(
      mkAsset({
        kind: 'video',
        derivatives: {
          v: 2,
          thumb256: { avif: 'a256', webp: 'w256', jpeg: 'j256' },
          videoPoster: 'poster.jpg',
          videoCompat: 'preview.mp4',
        },
      } as unknown as Partial<Asset>),
      { tiers: ['video'] },
    )
    const keys = vi.mocked(buildSignedUrl).mock.calls.map(([args]) => args.key)
    expect(keys.sort()).toEqual(['poster.jpg', 'preview.mp4'])
    expect(urls.thumb256).toBeNull()
  })

  test('a narrowed tier list still signs the original when nothing was derived', async () => {
    // 파생물이 없는 레거시·처리중 자산은 원본이 유일한 표시 경로 — 여기서 원본까지
    // 지우면 그리드가 통째로 빈 타일이 된다.
    vi.mocked(buildSignedUrl).mockClear()
    const urls = await resolveAssetUrls(mkAsset(), { tiers: ['thumb'] })
    expect(vi.mocked(buildSignedUrl).mock.calls).toHaveLength(1)
    expect(urls.original).toContain('/media/v1/files/')
  })

  test('blurhash and dominantColor flow through from asset row', async () => {
    const urls = await resolveAssetUrls(
      mkAsset({
        blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        dominantColor: '#a5b4c3',
      } as unknown as Partial<Asset>),
    )
    expect(urls.blurhash).toBe('L6PZfSi_.AyE_3t7t7R**0o#DgR4')
    expect(urls.dominantColor).toBe('#a5b4c3')
  })

  test('aspectRatioCached takes precedence over width/height calculation', async () => {
    const urls = await resolveAssetUrls(
      mkAsset({
        width: 1920,
        height: 1080,
        aspectRatioCached: 2.0,
      } as unknown as Partial<Asset>),
    )
    expect(urls.aspectRatio).toBe(2.0)
  })
})
