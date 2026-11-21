import { describe, expect, test } from 'vitest'
import { sanitizeUrl } from './logger'

describe('sanitizeUrl', () => {
  test('masks the token in a file URL and a download URL', () => {
    expect(sanitizeUrl('/media/v1/files/aaa.bbb.ccc')).toBe('/media/v1/files/[token]')
    expect(sanitizeUrl('/media/v1/download/aaa.bbb.ccc?x=1')).toBe('/media/v1/download/[token]?x=1')
  })

  test('masks the token in an image URL and keeps the asset and file name', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    expect(sanitizeUrl(`/media/v1/img/${id}/1800004500.${'A'.repeat(43)}/thumb256.webp`)).toBe(
      `/media/v1/img/${id}/[token]/thumb256.webp`,
    )
  })

  test('masks a token query parameter', () => {
    expect(sanitizeUrl('/media/v1/sse?token=abc&x=1')).toBe('/media/v1/sse?token=[redacted]&x=1')
  })
})
