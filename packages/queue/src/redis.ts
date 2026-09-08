import IORedis from 'ioredis'

function resolveUrl(url?: string): string {
  return url ?? process.env.REDIS_URL ?? 'redis://localhost:6379'
}

/**
 * 모든 Redis 연결이 쓰는 옵션 — 한 군데서만 정한다.
 *
 * maxRetriesPerRequest=null: BullMQ 워커의 요구사항(블로킹 명령이 재시도 상한에 걸려 워커가
 * 죽지 않게). 재연결 중 명령을 버리지 않는 성질이라 publish 쪽에도 그대로 맞다.
 *
 * 반환 타입을 `RedisOptions` 로 넓히지 말 것 — ioredis 6 의 생성자는 `replyMapping` 으로
 * 응답 타입을 추론하는데, 넓은 옵션 타입을 넘기면 exactOptionalPropertyTypes 아래서
 * `replyMapping?: undefined` 가 걸려 어떤 오버로드에도 안 맞는다.
 */
function redisOptions() {
  return { maxRetriesPerRequest: null }
}

/** 명령용 연결. 여러 Queue·Worker 가 공유해도 된다. */
export function createRedisConnection(url?: string): IORedis {
  return new IORedis(resolveUrl(url), redisOptions())
}

/**
 * 구독 전용 연결 — 옵션은 명령용과 같고, 다른 건 수명 계약이다: 구독자는 **반드시 자기
 * 연결**을 갖는다(공유·캐시 금지). RESP2 에서 구독 상태의 연결은 다른 명령을 못 받고,
 * ioredis 6 의 RESP3 가 그 제약을 풀어도 서버가 RESP2 로 폴백하면 되돌아온다. SSE 스트림
 * 하나당 하나씩 만들고 끝날 때 quit 하는 용도(apps/web 의 /api/stream/family).
 */
export function createRedisSubscriber(url?: string): IORedis {
  return new IORedis(resolveUrl(url), redisOptions())
}
