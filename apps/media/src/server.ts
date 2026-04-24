import cors from '@fastify/cors'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './http/middleware/error-handler'
import { requestIdPlugin } from './http/middleware/request-id'
import { assetsInitRoute } from './http/routes/assets-init'
import { assetsUrlsRoute } from './http/routes/assets-urls'
import { healthRoute } from './http/routes/health'
import { sseProgressRoute } from './http/routes/sse-progress'
import { tusRoute } from './http/routes/tus'
import { logger } from './lib/logger'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    bodyLimit: 256 * 1024 * 1024,
    disableRequestLogging: false,
  })

  app.register(cors, { origin: true, credentials: true })
  app.register(requestIdPlugin)
  registerErrorHandler(app)
  app.register(healthRoute)
  app.register(assetsInitRoute)
  app.register(assetsUrlsRoute)
  app.register(tusRoute)
  app.register(sseProgressRoute)

  return app
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.MEDIA_PORT ?? 3001)
  const host = process.env.MEDIA_HOST ?? '0.0.0.0'

  const app = buildApp()
  await app.listen({ port, host })
  logger.info({ port, host }, 'bebe-media server listening')
}
