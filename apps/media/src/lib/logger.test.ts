import { describe, expect, test } from 'vitest'
import { sanitizeUrl } from './logger'

describe('sanitizeUrl', () => {
  test('masks the token in a file URL and a download URL', () => {
    expect(sanitizeUrl('/media/v1/files/aaa.bbb.ccc')).toBe('/media/v1/files/[token]')
    expect(sanitizeUrl('/media/v1/download/aaa.bbb.ccc?x=1')).toBe('/media/v1/download/[token]?x=1')
  })

  test('masks the token in an image URL and keeps the asset and file name', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const token = `1800004500.${'A'.repeat(43)}`
    expect(sanitizeUrl(`/media/v1/img/${id}/thumb256.webp/${token}`)).toBe(
      `/media/v1/img/${id}/thumb256.webp/[token]`,
    )
    // 라우트에 안 맞아 404 로 끝나는 모양에서도 토큰은 로그에 남지 않는다.
    expect(sanitizeUrl(`/media/v1/img//${id}/thumb256.webp/${token}`)).not.toContain(token)
    expect(sanitizeUrl(`/MEDIA/V1/IMG/${id}/thumb256.webp/${token}`)).not.toContain(token)
    expect(sanitizeUrl(`/media/v1/img/${id}%2Fthumb256.webp%2F${token}`)).not.toContain(token)
    expect(sanitizeUrl(`/media/v1/img/${id}/${token}/thumb256.webp`)).not.toContain(token)
  })

  test('masks a JWT wherever it sits in a path that matched no route', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJrZXkiOiJ4In0.c2lnbmF0dXJl'
    expect(sanitizeUrl(`/MEDIA/V1/FILES/${jwt}`)).not.toContain(jwt)
    expect(sanitizeUrl(`/media/v1//files//${jwt}`)).not.toContain(jwt)
    // payload 가 숫자로 끝나고 서명이 43자인 진짜 모양 — 통째로 가려져 payload 도 남지 않는다.
    const real = `eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE4MDAwMDQ1MDB9.${'s'.repeat(43)}`
    expect(sanitizeUrl(`/media/v1//files//${real}`)).toBe('/media/v1//files//[token]')
  })

  test('masks a token query parameter', () => {
    expect(sanitizeUrl('/media/v1/sse?token=abc&x=1')).toBe('/media/v1/sse?token=[redacted]&x=1')
  })
})
