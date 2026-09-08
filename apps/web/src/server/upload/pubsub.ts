import { parseEnv } from '@bebe/config'
import { channelForFamily } from '@bebe/core'
import { createRedisConnection, createRedisSubscriber } from '@bebe/queue'
import type IORedis from 'ioredis'

export { channelForFamily }

const globalForRedis = globalThis as unknown as {
  __bebe_redis_pub?: IORedis
}

function redisUrl(): string {
  return parseEnv(process.env as Record<string, string | undefined>).REDIS_URL
}

export function getPublisher(): IORedis {
  if (!globalForRedis.__bebe_redis_pub) {
    globalForRedis.__bebe_redis_pub = createRedisConnection(redisUrl())
  }
  return globalForRedis.__bebe_redis_pub
}

/** SSE 스트림 하나가 쓰고 버리는 구독 연결 — 공유 publisher 를 재사용하면 안 된다. */
export function createSubscriber(): IORedis {
  return createRedisSubscriber(redisUrl())
}
