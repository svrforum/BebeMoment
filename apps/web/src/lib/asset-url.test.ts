import type { AssetUrls } from '@bebe/media-client'
import { describe, expect, it } from 'vitest'
import { pickThumbSrcSet, pickVideoUrl } from './asset-url'

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
