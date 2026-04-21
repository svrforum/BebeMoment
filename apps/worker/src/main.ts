import { parseEnv } from '@bebe/config'
import pino from 'pino'
import { createRedisConnection } from './redis'
import { createAssetWorker } from './worker'

const env = parseEnv(process.env as Record<string, string | undefined>)

const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['password', 'client_secret', 'clientSecretEnc', 'authorization', '*.authorization', 'cookie'],
    censor: '[REDACTED]',
  },
})

const connection = createRedisConnection(env.REDIS_URL)
const publisher = createRedisConnection(env.REDIS_URL)
const worker = createAssetWorker(connection, publisher)

worker.on('completed', (job) => {
  logger.info({ id: job.id, ...job.data }, 'job completed')
})
worker.on('failed', (job, err) => {
  logger.error({ id: job?.id, error: err.message }, 'job failed')
})

logger.info('bebe-worker started')

const shutdown = async () => {
  logger.info('bebe-worker shutting down')
  await worker.close()
  await connection.quit()
  await publisher.quit()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
