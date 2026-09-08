import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { config, proxy } from './proxy'

function req(
  method: string,
  path: string,
  headers: Record<string, string> = { host: 'bebe.example' },
): NextRequest {
  return new NextRequest(`http://bebe.example${path}`, { method, headers })
}

describe('proxy — CSRF origin check', () => {
  it('lets GET through untouched and forwards x-pathname to the app', () => {
    const res = proxy(req('GET', '/detail/52?x=1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/detail/52?x=1')
  })

  it('rejects a state-changing request whose Origin host differs', () => {
    const res = proxy(
      req('POST', '/api/share', { host: 'bebe.example', origin: 'https://evil.example' }),
    )
    expect(res.status).toBe(403)
  })

  it('falls back to Referer when Origin is absent and rejects a mismatch', () => {
    const res = proxy(
      req('POST', '/api/share', { host: 'bebe.example', referer: 'https://evil.example/page' }),
    )
    expect(res.status).toBe(403)
  })

  it('passes a same-origin request', () => {
    const res = proxy(
      req('POST', '/api/share', { host: 'bebe.example', origin: 'https://bebe.example' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  // 네이티브 앱(세션 쿠키 기반 서버 호출)·서버투서버·curl 은 Origin 도 Referer 도 없다 —
  // SameSite=lax 쿠키가 1차 방어선이라 통과시킨다.
  it('passes when neither Origin nor Referer is present', () => {
    const res = proxy(req('DELETE', '/api/share/abc', { host: 'bebe.example' }))
    expect(res.status).toBe(200)
  })

  it('rejects a malformed Origin', () => {
    const res = proxy(req('POST', '/api/share', { host: 'bebe.example', origin: 'not a url' }))
    expect(res.status).toBe(403)
  })

  it('marks /api/* responses no-store and leaves pages alone', () => {
    expect(proxy(req('GET', '/api/share')).headers.get('cache-control')).toBe('no-store')
    expect(proxy(req('GET', '/timeline')).headers.get('cache-control')).toBeNull()
  })
})

describe('proxy — matcher', () => {
  // Next 는 matcher 를 path-to-regexp 로 컴파일한다. 괄호 안이 커스텀 정규식 그대로라 `^…$` 로
  // 감싼 것이 같은 판정을 낸다.
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it('excludes OIDC callbacks and static assets, covers everything else', () => {
    expect(matcher.test('/api/auth/oidc/kakao/callback')).toBe(false)
    expect(matcher.test('/api/auth/oidc/kakao')).toBe(false)
    expect(matcher.test('/_next/static/chunks/app.js')).toBe(false)
    expect(matcher.test('/fonts/pretendard.woff2')).toBe(false)
    expect(matcher.test('/api/auth/login')).toBe(true)
    expect(matcher.test('/api/share')).toBe(true)
    expect(matcher.test('/timeline')).toBe(true)
    expect(matcher.test('/s/abc')).toBe(true)
  })
})
