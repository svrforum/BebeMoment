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

/** 프록시 뒤 클라이언트 IP 추정(x-forwarded-for 첫 항목 → x-real-ip). 없으면 'unknown'. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** 초과 시 표준 429 응답(Retry-After 헤더 + 한국어 메시지). */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: '시도가 너무 많아요. 잠시 후 다시 시도해주세요.' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
  })
}
