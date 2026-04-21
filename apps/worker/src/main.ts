import { parseEnv } from '@bebe/config'
import { createRedisConnection } from './redis'
import { createAssetWorker } from './worker'

const env = parseEnv(process.env as Record<string, string | undefined>)

const connection = createRedisConnection(env.REDIS_URL)
const publisher = createRedisConnection(env.REDIS_URL)
const worker = createAssetWorker(connection, publisher)

worker.on('completed', (job) => {
  console.log({ id: job.id, ...job.data }, 'job completed')
})
worker.on('failed', (job, err) => {
  console.error({ id: job?.id, error: err.message }, 'job failed')
})

console.log('bebe-worker started')

const shutdown = async () => {
  console.log('bebe-worker shutting down')
  await worker.close()
  await connection.quit()
  await publisher.quit()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
