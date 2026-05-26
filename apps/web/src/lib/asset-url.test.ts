import type { AssetUrls } from '@bebe/media-client'
import { describe, expect, it } from 'vitest'
import { pickVideoUrl } from './asset-url'

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
