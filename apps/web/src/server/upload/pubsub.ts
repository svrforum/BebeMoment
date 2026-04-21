import { parseEnv } from '@bebe/config'
import IORedis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  __bebe_redis_pub?: IORedis
}

export function getPublisher(): IORedis {
  if (!globalForRedis.__bebe_redis_pub) {
    const env = parseEnv(process.env as Record<string, string | undefined>)
    globalForRedis.__bebe_redis_pub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
  }
  return globalForRedis.__bebe_redis_pub
}

export function createSubscriber(): IORedis {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
}

export function channelForFamily(familyId: string): string {
  return `bebe:events:family:${familyId}`
}
