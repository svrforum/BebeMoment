import { afterEach, describe, expect, it, vi } from 'vitest'
import { exchangeNaverCode, fetchNaverProfile } from './naver'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(status: number, json: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json })),
  )
}

describe('fetchNaverProfile', () => {
  it('response 를 언랩해 sub/email/displayName 매핑', async () => {
    mockFetch(200, {
      resultcode: '00',
      message: 'success',
      response: { id: 'naver-123', email: 'a@b.com', name: '홍길동', nickname: '길동이' },
    })
    const p = await fetchNaverProfile('tok')
    expect(p.sub).toBe('naver-123')
    expect(p.email).toBe('a@b.com')
    // 네이버엔 표준 email_verified 가 없어 검증으로 신뢰하지 않는다 — 이메일 일치
    // 자동병합(계정 탈취 벡터)을 막기 위해 항상 false. (providerId,subject)로만 연결.
    expect(p.emailVerified).toBe(false)
    expect(p.displayName).toBe('길동이') // nickname 우선
  })

  it('nickname 없으면 name 으로 displayName', async () => {
    mockFetch(200, { resultcode: '00', message: 'ok', response: { id: 'n1', name: '김철수' } })
    const p = await fetchNaverProfile('tok')
    expect(p.displayName).toBe('김철수')
    expect(p.email).toBeUndefined()
    expect(p.emailVerified).toBe(false)
  })

  it('resultcode 가 00 이 아니면 에러', async () => {
    mockFetch(200, { resultcode: '024', message: 'Authentication failed' })
    await expect(fetchNaverProfile('tok')).rejects.toThrow(/Naver profile error/)
  })
})

describe('exchangeNaverCode', () => {
  it('access_token 반환', async () => {
    mockFetch(200, { access_token: 'AAA', token_type: 'bearer' })
    const r = await exchangeNaverCode({
      code: 'c',
      state: 's',
      clientId: 'id',
      clientSecret: 'sec',
    })
    expect(r.access_token).toBe('AAA')
  })

  it('access_token 없으면 에러', async () => {
    mockFetch(200, { error: 'invalid_request' })
    await expect(
      exchangeNaverCode({ code: 'c', state: 's', clientId: 'id', clientSecret: 'sec' }),
    ).rejects.toThrow(/missing access_token/)
  })
})
