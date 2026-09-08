import { describe, expect, it } from 'vitest'
import { clientIp, memoryRateLimitStore, rateLimit } from './rate-limit'

function clock(start = 1_000_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('rateLimit (fixed window)', () => {
  it('allows up to the limit, then rejects with the remaining window as retryAfter', async () => {
    const c = clock()
    const store = memoryRateLimitStore(c.now)
    for (let i = 0; i < 3; i += 1) {
      expect(await rateLimit('login:1.2.3.4', 3, 60, store)).toEqual({ ok: true, retryAfter: 0 })
    }
    c.advance(10_000)
    expect(await rateLimit('login:1.2.3.4', 3, 60, store)).toEqual({ ok: false, retryAfter: 50 })
  })

  it('opens again once the window has passed', async () => {
    const c = clock()
    const store = memoryRateLimitStore(c.now)
    await rateLimit('k', 1, 60, store)
    expect((await rateLimit('k', 1, 60, store)).ok).toBe(false)
    c.advance(60_001)
    expect((await rateLimit('k', 1, 60, store)).ok).toBe(true)
  })

  it('keeps keys independent', async () => {
    const store = memoryRateLimitStore(clock().now)
    await rateLimit('a', 1, 60, store)
    expect((await rateLimit('a', 1, 60, store)).ok).toBe(false)
    expect((await rateLimit('b', 1, 60, store)).ok).toBe(true)
  })

  // 보안 하드닝이 가용성 사고가 되면 안 된다 — Redis 가 없거나 죽으면 통과시킨다.
  it('fails open without a store or when the store throws', async () => {
    expect(await rateLimit('k', 1, 60, null)).toEqual({ ok: true, retryAfter: 0 })
    const broken = {
      incr: async () => {
        throw new Error('down')
      },
      expire: async () => 1,
      ttl: async () => -2,
    }
    expect(await rateLimit('k', 1, 60, broken)).toEqual({ ok: true, retryAfter: 0 })
  })
})

describe('clientIp', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h })

  it('prefers x-real-ip, then the last x-forwarded-for hop', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9')
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('2.2.2.2')
    expect(clientIp(req({}))).toBe('unknown')
  })
})
