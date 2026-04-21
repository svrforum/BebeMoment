import IORedis from 'ioredis'

export function createRedisConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null })
}
