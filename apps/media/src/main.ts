import { logger } from './lib/logger'

const role = (process.env.MEDIA_ROLE ?? 'both').toLowerCase()
if (!['server', 'worker', 'both'].includes(role)) {
  logger.fatal({ role }, 'MEDIA_ROLE must be one of: server | worker | both')
  process.exit(1)
}

logger.info({ role }, 'bebe-media starting')

async function main(): Promise<void> {
  if (role === 'server' || role === 'both') {
    const { startServer } = await import('./server')
    await startServer()
  }
  if (role === 'worker' || role === 'both') {
    const { startWorker } = await import('./worker')
    await startWorker()
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error')
  process.exit(1)
})

const shutdown = async (): Promise<void> => {
  logger.info('bebe-media shutting down')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
