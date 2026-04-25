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
    expect(parsed?.thumb256.avif).toBe('k1')
  })

  test('returns null for v1 legacy shape', () => {
    const legacy = { thumb_sm: 'k1', thumb_md: 'k2', thumb_lg: 'k3' }
    expect(parseDerivativesV2(legacy)).toBeNull()
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
