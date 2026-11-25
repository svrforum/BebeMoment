import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next-path'

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

  // 로그인 화면은 ?next= 를 URLSearchParams 로 읽는다 — 그 시점에 %09·%0A 가 이미 탭·줄바꿈이다.
  it.each([
    'next=/%09/evil.example',
    'next=/%0A/evil.example',
    'next=/%0D%0A/evil.example',
    'next=/%5Cevil.example',
    'next=%2F%2Fevil.example',
    'next=https%3A%2F%2Fevil.example',
  ])('rejects the decoded query %j', (query) => {
    expect(safeNextPath(new URLSearchParams(query).get('next'))).toBeNull()
  })

  it('every path it keeps stays on the origin it is resolved against', () => {
    for (const p of ['/a', '/a/../b', '/%2F%2Fevil.example', '/%09/evil.example']) {
      const kept = safeNextPath(p)
      expect(kept).toBe(p)
      expect(new URL(p, 'https://app.example.com').origin).toBe('https://app.example.com')
    }
  })
})
