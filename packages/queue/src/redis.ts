import IORedis from 'ioredis'

export function createRedisConnection(url?: string): IORedis {
  return new IORedis(url ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
}
