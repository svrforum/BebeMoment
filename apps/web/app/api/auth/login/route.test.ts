import { describe, expect, it, vi } from 'vitest'

// 라우트가 부르는 rateLimit 은 REDIS_URL 이 있을 때 @bebe/queue 의 연결을 스토어로 쓴다 —
// 여기서는 그 연결을 인메모리 카운터로 바꿔 Redis 없이 429 경로를 돈다.
const fakeRedis = vi.hoisted(() => {
  const counters = new Map<string, number>()
  return {
    incr: async (k: string) => {
      const n = (counters.get(k) ?? 0) + 1
      counters.set(k, n)
      return n
    },
    expire: async () => 1,
    ttl: async () => 42,
  }
})
vi.mock('@bebe/queue', () => ({ createRedisConnection: () => fakeRedis }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => true }),
  getLocale: async () => 'ko',
}))
vi.mock('@/lib/db-init', () => ({ prismaPublic: {}, prismaMedia: {} }))
vi.mock('@/lib/oidc-session', () => ({ createSessionAndSetCookie: vi.fn() }))
vi.mock('@/lib/session-cookie', () => ({ resolveCurrentFamilyForUser: vi.fn() }))

process.env.REDIS_URL = 'redis://test-fake'

function post(body: unknown): Promise<Response> {
  return import('./route').then(({ POST }) =>
    POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
        body: JSON.stringify(body),
      }),
    ),
  )
}

describe('POST /api/auth/login', () => {
  it('returns 429 with retry-after once the per-IP limit is exceeded', async () => {
    // 10/분 — 처음 10번은 본문 검증(400)까지 가고, 11번째부터 레이트리밋이 먼저 거절한다.
    for (let i = 0; i < 10; i += 1) {
      const res = await post({})
      expect(res.status, `request ${i + 1}`).toBe(400)
    }
    const limited = await post({})
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('42')
    expect(await limited.json()).toEqual({ error: 'tooManyRequests' })
  })
})
