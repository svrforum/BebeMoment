import { errorJsonKey } from '@/lib/error-response'
import { createRedisConnection } from '@bebe/queue'
import type { NextResponse } from 'next/server'

/** 고정-윈도우 카운터에 필요한 최소 연산 — ioredis 인스턴스가 그대로 만족한다. */
export type RateLimitStore = {
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
  ttl(key: string): Promise<number>
}

// 인증 엔드포인트(로그인·가입·비번재설정·앱핸드오프) 무차별 대입 방어용 고정-윈도우
// 레이트리밋. 공유 Redis(@bebe/queue) 사용. Redis 장애 시 fail-open(허용)해서 로그인이
// 잠기지 않게 한다 — 보안 하드닝이지 가용성 위험이 되면 안 된다.
let _redis: RateLimitStore | null = null
function redisStore(): RateLimitStore | null {
  if (_redis) return _redis
  if (!process.env.REDIS_URL) return null
  _redis = createRedisConnection(process.env.REDIS_URL)
  return _redis
}

/** 테스트·단일 프로세스용 인메모리 스토어. 시계를 주입해 윈도 만료를 결정적으로 검증한다. */
export function memoryRateLimitStore(now: () => number = Date.now): RateLimitStore {
  const entries = new Map<string, { n: number; expiresAt: number }>()
  return {
    async incr(key) {
      const e = entries.get(key)
      if (!e || e.expiresAt <= now()) {
        entries.set(key, { n: 1, expiresAt: Number.POSITIVE_INFINITY })
        return 1
      }
      e.n += 1
      return e.n
    },
    async expire(key, seconds) {
      const e = entries.get(key)
      if (e) e.expiresAt = now() + seconds * 1000
      return e ? 1 : 0
    },
    async ttl(key) {
      const e = entries.get(key)
      if (!e || e.expiresAt <= now()) return -2
      if (e.expiresAt === Number.POSITIVE_INFINITY) return -1
      return Math.ceil((e.expiresAt - now()) / 1000)
    },
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  store: RateLimitStore | null = redisStore(),
): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    if (!store) return { ok: true, retryAfter: 0 }
    const k = `rl:${key}`
    const n = await store.incr(k)
    if (n === 1) await store.expire(k, windowSec)
    if (n > limit) {
      const ttl = await store.ttl(k)
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSec }
    }
    return { ok: true, retryAfter: 0 }
  } catch {
    return { ok: true, retryAfter: 0 }
  }
}

/**
 * 프록시 뒤 클라이언트 IP. **신뢰 프록시가 설정하는 `x-real-ip` 우선**, 없으면 XFF 의
 * **마지막**(가장 가까운 프록시가 덧붙인) 항목을 쓴다 — XFF 첫 항목은 클라이언트가 위조 가능해
 * 레이트리밋 우회(무한 버킷)에 악용되므로 신뢰하지 않는다. (리버스 프록시가 클라이언트의
 * x-real-ip 를 덮어쓰고 x-forwarded-for 를 append 하는 표준 구성을 전제.)
 */
export function clientIp(req: Request): string {
  // 프록시 뒤가 아니면(TRUST_PROXY=false) 포워딩 헤더는 클라가 위조 가능·무의미하므로
  // 단일 버킷으로 모은다(per-IP 우회 방지). 부가 캡(계정·전역)과 함께 동작.
  const tp = process.env.TRUST_PROXY?.trim().toLowerCase()
  if (tp === 'false' || tp === '0') return 'no-proxy'
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',')
    return parts[parts.length - 1]?.trim() || 'unknown'
  }
  return 'unknown'
}

/** 초과 시 표준 429 응답(Retry-After 헤더) — 다른 API 에러처럼 로그·번역을 지난다. */
export function tooManyRequests(retryAfter: number): Promise<NextResponse> {
  return errorJsonKey('tooManyRequests', 429, { headers: { 'retry-after': String(retryAfter) } })
}
