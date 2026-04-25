import { describe, expect, test } from 'vitest'
import { parseDerivativesV2 } from './derivatives-v2'

describe('parseDerivativesV2', () => {
  test('parses v2 shape', () => {
    const input = {
      v: 2,
      thumb256: { avif: 'k1', webp: 'k2', jpeg: 'k3' },
      thumb512: { avif: 'k4', webp: 'k5', jpeg: 'k6' },
      display1080: { avif: 'k7', webp: 'k8', jpeg: 'k9' },
    }
    const parsed = parseDerivativesV2(input)
    expect(parsed?.v).toBe(2)
    expect(parsed?.thumb256?.avif).toBe('k1')
  })

  test('returns null for v1 legacy shape (thumb_sm/_md/_lg)', () => {
    const legacy = { thumb_sm: 'k1', thumb_md: 'k2', thumb_lg: 'k3' }
    expect(parseDerivativesV2(legacy)).toBeNull()
  })

  test('adapts legacy video shape { poster, preview_video } to v2', () => {
    const legacy = {
      poster: 'derivatives/x/poster.jpg',
      preview_video: 'derivatives/x/preview.mp4',
    }
    const parsed = parseDerivativesV2(legacy)
    expect(parsed?.videoPoster).toBe('derivatives/x/poster.jpg')
    expect(parsed?.videoCompat).toBe('derivatives/x/preview.mp4')
    expect(parsed?.thumb256).toBeUndefined()
  })

  test('returns null for empty / invalid', () => {
    expect(parseDerivativesV2({})).toBeNull()
    expect(parseDerivativesV2(null)).toBeNull()
    expect(parseDerivativesV2(undefined)).toBeNull()
  })

  test('accepts optional video keys', () => {
    const input = {
      v: 2,
      thumb256: { avif: 'a', webp: 'b', jpeg: 'c' },
      thumb512: { avif: 'a', webp: 'b', jpeg: 'c' },
      display1080: { avif: 'a', webp: 'b', jpeg: 'c' },
      videoPoster: 'p',
      videoCompat: 'm',
    }
    const parsed = parseDerivativesV2(input)
    expect(parsed?.videoPoster).toBe('p')
    expect(parsed?.videoCompat).toBe('m')
  })
})
