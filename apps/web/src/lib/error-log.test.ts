import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { errorLogFields, levelForStatus } from './error-log'

const SECRET = 'Zq8secretTokenValue123'

function loggedPath(p: string): string {
  return String(errorLogFields({ status: 400, message: 'x', path: p }).path)
}

describe('levelForStatus', () => {
  it('5xx 는 error — 우리 잘못이라 반드시 눈에 띄어야 한다', () => {
    expect(levelForStatus(500)).toBe('error')
    expect(levelForStatus(502)).toBe('error')
  })

  it('4xx 는 warn — 대부분 정상적인 거절이라 error 로 채우면 진짜 문제가 묻힌다', () => {
    expect(levelForStatus(400)).toBe('warn')
    expect(levelForStatus(404)).toBe('warn')
  })

  it('401 은 info — 로그인 안 한 요청은 늘 있다', () => {
    expect(levelForStatus(401)).toBe('info')
    expect(levelForStatus(403)).toBe('warn')
  })
})

describe('errorLogFields', () => {
  it('경로·상태·메시지를 남긴다', () => {
    const f = errorLogFields({ status: 400, message: 'story.tooMany', path: '/api/story' })
    expect(f).toMatchObject({ status: 400, path: '/api/story', err: 'story.tooMany' })
  })

  it('경로가 없어도 죽지 않는다 — proxy 를 안 탄 요청도 있다', () => {
    expect(errorLogFields({ status: 500, message: 'boom' }).path).toBe('unknown')
  })

  it('쿼리스트링의 토큰은 지운다 — 로그가 탈취 경로가 되면 안 된다', () => {
    const f = errorLogFields({
      status: 401,
      message: 'x',
      path: '/api/widget/data?token=abcdef123456&size=2',
    })
    expect(String(f.path)).not.toContain('abcdef123456')
    expect(String(f.path)).toContain('token=[redacted]')
  })

  it.each([
    ['/api/auth/password-reset/T', '/api/auth/password-reset/[token]'],
    ['/api/share/T', '/api/share/[token]'],
    ['/s/T', '/s/[token]'],
    ['/s/T?from=app', '/s/[token]?from=app'],
    ['/invite/T', '/invite/[token]'],
    ['/media/v1/files/T', '/media/v1/files/[token]'],
    ['/api/auth/oidc/kakao?invite=T&next=/', '/api/auth/oidc/kakao?invite=[redacted]&next=/'],
    [
      '/api/auth/oidc/kakao/callback?code=T&state=T',
      '/api/auth/oidc/kakao/callback?code=[redacted]&state=[redacted]',
    ],
  ])('경로에 실린 비밀은 지운다: %s', (raw, masked) => {
    const out = loggedPath(raw.replaceAll('T', SECRET))
    expect(out).not.toContain(SECRET)
    expect(out).toBe(masked)
  })

  it('비밀이 아닌 고정 경로는 그대로 둔다 — 로그로 어느 라우트인지는 알아야 한다', () => {
    expect(loggedPath('/api/share/init')).toBe('/api/share/init')
    expect(loggedPath('/api/share?mine=1')).toBe('/api/share?mine=1')
    expect(loggedPath('/api/invite/accept')).toBe('/api/invite/accept')
    expect(loggedPath('/api/story/3')).toBe('/api/story/3')
  })

  /**
   * 경로 파라미터로 토큰을 받는 라우트를 새로 만들면 여기서 걸린다. 비번 재설정 토큰과 공유
   * 토큰이 경로째 로그에 남던 것을 고친 뒤에 둔 가드 — 마스킹 패턴을 같이 늘리지 않으면
   * 새 경로의 토큰이 다시 로그로 샌다.
   */
  it('app/ 아래 [token] 류 세그먼트는 전부 마스킹된다', () => {
    const appDir = path.join(process.cwd(), 'app')
    const routes: string[] = []
    const walk = (dir: string, segs: string[]): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (!statSync(full).isDirectory()) continue
        const next = /^\(.*\)$/.test(name) ? segs : [...segs, name]
        if (/^\[.*(token|secret|code).*\]$/i.test(name)) routes.push(`/${next.join('/')}`)
        walk(full, next)
      }
    }
    walk(appDir, [])
    expect(routes.length).toBeGreaterThan(0)
    const leaks = routes.filter((route) => {
      const sample = route
        .split('/')
        .map((seg) =>
          /^\[.*(token|secret|code).*\]$/i.test(seg) ? SECRET : seg.replace(/^\[.*\]$/, '7'),
        )
        .join('/')
      return loggedPath(sample).includes(SECRET)
    })
    expect(leaks).toEqual([])
  })

  it('긴 메시지는 자른다', () => {
    const f = errorLogFields({ status: 500, message: 'x'.repeat(900) })
    expect(String(f.err).length).toBeLessThanOrEqual(300)
  })

  it('5xx 는 스택도 남긴다 — 4xx 는 남기지 않는다(소음)', () => {
    const e = new Error('boom')
    expect(errorLogFields({ status: 500, message: 'boom', error: e }).stack).toBeTruthy()
    expect(errorLogFields({ status: 400, message: 'boom', error: e }).stack).toBeUndefined()
  })
})
