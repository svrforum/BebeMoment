import { describe, expect, it } from 'vitest'
import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it.each(['/', '/story/20', '/timeline?date=2026-01-01#top', '/s/abc'])('keeps %j', (p) => {
    expect(safeNextPath(p)).toBe(p)
  })

  it.each([
    '//evil.example/x',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\n/evil.example',
    '\t//evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    'story/20',
    '',
    null,
    undefined,
  ])('rejects %j', (p) => {
    expect(safeNextPath(p)).toBeNull()
  })

  it('every path it keeps stays on the origin it is resolved against', () => {
    for (const p of ['/a', '/a/../b', '/%2F%2Fevil.example', '/%09/evil.example']) {
      const kept = safeNextPath(p)
      expect(kept).toBe(p)
      expect(new URL(p, 'https://app.example.com').origin).toBe('https://app.example.com')
    }
  })
})
