import { logger } from './lib/logger'

const role = (process.env.MEDIA_ROLE ?? 'both').toLowerCase()
if (!['server', 'worker', 'both'].includes(role)) {
  logger.fatal({ role }, 'MEDIA_ROLE must be one of: server | worker | both')
  process.exit(1)
}

logger.info({ role }, 'bebe-media starting')

async function main(): Promise<void> {
  const closers: Array<() => Promise<void>> = []
  if (role === 'server' || role === 'both') {
    const { startServer } = await import('./server')
    closers.push(await startServer())
  }
  if (role === 'worker' || role === 'both') {
    const { startWorker } = await import('./worker')
    closers.push(await startWorker())
  }

  // 단일 종료 핸들러로 서버·워커를 함께 graceful close 한다. 과거엔 main 이 즉시
  // process.exit(0) 해서 worker 의 graceful close 가 끝나기 전에 프로세스가 죽어
  // 진행 중 sharp/ffmpeg 잡이 중단됐다. 10초 안에 안 끝나면 강제 종료.
  let shuttingDown = false
  const shutdown = async (sig: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ sig }, 'bebe-media shutting down')
    const force = setTimeout(() => {
      logger.warn('graceful shutdown timed out — forcing exit')
      process.exit(1)
    }, 10_000)
    force.unref()
    await Promise.all(
      closers.map((c) => c().catch((err) => logger.error({ err }, 'shutdown closer failed'))),
    )
    clearTimeout(force)
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error')
  process.exit(1)
})
