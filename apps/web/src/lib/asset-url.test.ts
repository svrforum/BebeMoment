import type { AssetUrls } from '@bebe/media-client'
import { describe, expect, it } from 'vitest'
import {
  type GridAssetUrls,
  pickThumbSrcSet,
  pickThumbTrio,
  pickThumbUrl,
  pickVideoUrl,
  toGridUrls,
} from './asset-url'

const trio = (name: string) => ({
  avif: `https://m/${name}.avif`,
  webp: `https://m/${name}.webp`,
  jpeg: `https://m/${name}.jpg`,
})

describe('pickThumbSrcSet', () => {
  it('thumb256 과 thumb512 를 폭 서술자로 묶는다 (포맷별)', () => {
    expect(pickThumbSrcSet({ ...base, thumb256: trio('t256'), thumb512: trio('t512') })).toEqual({
      avif: 'https://m/t256.avif 256w, https://m/t512.avif 512w',
      webp: 'https://m/t256.webp 256w, https://m/t512.webp 512w',
      jpeg: 'https://m/t256.jpg 256w, https://m/t512.jpg 512w',
    })
  })
  it('한 티어만 있으면 그것만 넣는다', () => {
    expect(pickThumbSrcSet({ ...base, thumb512: trio('t512') })).toEqual({
      avif: 'https://m/t512.avif 512w',
      webp: 'https://m/t512.webp 512w',
      jpeg: 'https://m/t512.jpg 512w',
    })
  })
  it('썸네일 티어가 없으면(레거시) null', () => {
    expect(pickThumbSrcSet(base)).toBe(null)
    expect(pickThumbSrcSet(null)).toBe(null)
  })
})

const base: AssetUrls = {
  blurhash: null,
  dominantColor: null,
  aspectRatio: null,
  thumb256: null,
  thumb512: null,
  display1080: null,
  videoPoster: null,
  videoCompat: null,
  original: 'https://m/original.mov',
  expiresAt: '',
}

describe('pickVideoUrl', () => {
  it('prefers videoCompat (H.264) over original', () => {
    expect(pickVideoUrl({ ...base, videoCompat: 'https://m/preview.mp4' })).toBe(
      'https://m/preview.mp4',
    )
  })
  it('falls back to original when no videoCompat (legacy)', () => {
    expect(pickVideoUrl(base)).toBe('https://m/original.mov')
  })
  it('returns null for null urls', () => {
    expect(pickVideoUrl(null)).toBe(null)
  })
})

describe('toGridUrls', () => {
  const full: AssetUrls = {
    ...base,
    blurhash: 'L6PZ',
    dominantColor: '#a5b4c3',
    aspectRatio: 1.5,
    thumb256: trio('t256'),
    thumb512: trio('t512'),
    display1080: trio('d1080'),
    videoPoster: 'https://m/poster.jpg',
    videoCompat: 'https://m/preview.mp4',
    expiresAt: '2026-09-08T00:00:00.000Z',
  }

  it('그리드가 그리는 것만 남기고 뷰어 전용 티어는 버린다', () => {
    const grid = toGridUrls(full)
    expect(grid).toEqual({
      blurhash: 'L6PZ',
      dominantColor: '#a5b4c3',
      aspectRatio: 1.5,
      thumb256: trio('t256'),
      thumb512: trio('t512'),
      videoPoster: 'https://m/poster.jpg',
      original: null,
      display1080: null,
      videoCompat: null,
      expiresAt: '2026-09-08T00:00:00.000Z',
    })
  })

  it('그릴 게 원본밖에 없는 레거시 자산은 원본을 남긴다', () => {
    const legacy: AssetUrls = { ...base, original: 'https://m/original.jpg' }
    expect(toGridUrls(legacy)?.original).toBe('https://m/original.jpg')
  })

  it('null 은 null 로 통과', () => {
    expect(toGridUrls(null)).toBe(null)
    expect(toGridUrls(undefined)).toBe(null)
  })

  it('AssetUrls 자리에 그대로 들어가고 썸네일 헬퍼가 그대로 동작한다', () => {
    const grid = toGridUrls(full)
    // GridAssetUrls 는 AssetUrls 의 부분집합 타입 — 좁힌 값을 넓은 자리에 넣어도
    // 타입이 통과해야 아직 안 좁힌 소비자(타임라인 그리드 등)가 깨지지 않는다.
    const asWide: AssetUrls | null = grid
    expect(pickThumbTrio(asWide)).toEqual(trio('t256'))
    expect(pickThumbUrl(asWide)).toBe('https://m/t256.jpg')
    expect(pickThumbSrcSet(asWide)?.jpeg).toBe('https://m/t256.jpg 256w, https://m/t512.jpg 512w')
  })

  it('이미 좁힌 값을 다시 좁혀도 같다 (idempotent)', () => {
    const once = toGridUrls(full)
    const twice: GridAssetUrls | null = toGridUrls(once)
    expect(twice).toEqual(once)
  })

  it('JSON 직렬화 크기가 줄어든다', () => {
    const wide = JSON.stringify(full).length
    const narrow = JSON.stringify(toGridUrls(full)).length
    expect(narrow).toBeLessThan(wide)
  })
})
