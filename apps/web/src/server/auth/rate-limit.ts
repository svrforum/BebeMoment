import { createRedisConnection } from '@bebe/queue'
import type IORedis from 'ioredis'

// 인증 엔드포인트(로그인·가입·비번재설정·앱핸드오프) 무차별 대입 방어용 고정-윈도우
// 레이트리밋. 공유 Redis(@bebe/queue) 사용. Redis 장애 시 fail-open(허용)해서 로그인이
// 잠기지 않게 한다 — 보안 하드닝이지 가용성 위험이 되면 안 된다.
let _redis: IORedis | null = null
function redis(): IORedis | null {
  if (_redis) return _redis
  if (!process.env.REDIS_URL) return null
  _redis = createRedisConnection(process.env.REDIS_URL)
  return _redis
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    const r = redis()
    if (!r) return { ok: true, retryAfter: 0 }
    const k = `rl:${key}`
    const n = await r.incr(k)
    if (n === 1) await r.expire(k, windowSec)
    if (n > limit) {
      const ttl = await r.ttl(k)
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
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',')
    return parts[parts.length - 1]?.trim() || 'unknown'
  }
  return 'unknown'
}

/** 초과 시 표준 429 응답(Retry-After 헤더 + 한국어 메시지). */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
  })
}
