import cors from '@fastify/cors'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './http/middleware/error-handler'
import { requestIdPlugin } from './http/middleware/request-id'
import { assetsInitRoute } from './http/routes/assets-init'
import { assetsPurgeRoute } from './http/routes/assets-purge'
import { assetsUpdateRoute } from './http/routes/assets-update'
import { assetsUrlsRoute } from './http/routes/assets-urls'
import { assetsUrlsBatchRoute } from './http/routes/assets-urls-batch'
import { downloadRoute } from './http/routes/download'
import { downloadMintRoute } from './http/routes/download-mint'
import { filesRoute } from './http/routes/files'
import { healthRoute } from './http/routes/health'
import { sseProgressRoute } from './http/routes/sse-progress'
import { tusRoute } from './http/routes/tus'
import { logger, sanitizeUrl } from './lib/logger'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Fastify 5: `logger` 는 설정 객체만 받는다. 커스텀 pino 인스턴스는 loggerInstance 로.
    // FastifyBaseLogger 로 캐스트해 app 이 기본 FastifyInstance 로 추론되게(구체 pino
    // Logger 로 추론되면 라우트 플러그인·반환 타입과 child() 변성에서 어긋난다).
    loggerInstance: logger as unknown as FastifyBaseLogger,
    bodyLimit: 256 * 1024 * 1024,
    // 자동 요청 로깅은 URL(서명 토큰 포함)을 그대로 찍는다 — Fastify 기본 serializer 는
    // pino 인스턴스 serializer 를 무시하므로, 직접 끄고 아래 훅에서 마스킹해 찍는다.
    disableRequestLogging: true,
    maxParamLength: 2048,
  })

  app.addHook('onResponse', (req, reply, done) => {
    req.log.info(
      { method: req.method, url: sanitizeUrl(req.url), statusCode: reply.statusCode },
      'request completed',
    )
    done()
  })

  app.register(cors, { origin: true, credentials: true })
  app.register(requestIdPlugin)
  registerErrorHandler(app)
  app.register(healthRoute)
  app.register(assetsInitRoute)
  app.register(assetsUpdateRoute)
  app.register(assetsUrlsRoute)
  app.register(assetsUrlsBatchRoute)
  app.register(assetsPurgeRoute)
  app.register(filesRoute)
  app.register(downloadMintRoute)
  app.register(downloadRoute)
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
