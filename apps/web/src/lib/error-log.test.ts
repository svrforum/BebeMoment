import { describe, expect, it } from 'vitest'
import { errorLogFields, levelForStatus } from './error-log'

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
