import { parseEnv } from '@bebe/config'
import pino from 'pino'

const env = parseEnv(process.env as Record<string, string | undefined>)

// 서명 토큰은 URL 에 실린다(/files/<jwt>, /download/<signed>, ?token=). 요청 로그에
// 그대로 남으면 짧은 TTL 동안 토큰 탈취 경로가 되므로 로깅 직전에 마스킹한다.
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url
  return url
    .replace(/\/(files|download)\/[^/?]+/g, '/$1/[token]')
    .replace(/([?&]token=)[^&]+/g, '$1[redacted]')
}

type RawReq = {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string; remotePort?: number }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  serializers: {
    // Fastify 의 요청 로그(req)는 raw Node IncomingMessage 를 직렬화한다 — url 만 마스킹하고
    // 나머지는 기본 필드를 흉내낸다. (Fastify 가 자체 serializer 를 쓰면 무효과일 뿐 무해.)
    req(req: RawReq) {
      return {
        method: req.method,
        url: sanitizeUrl(req.url),
        host: req.headers?.host,
        remoteAddress: req.socket?.remoteAddress,
        remotePort: req.socket?.remotePort,
      }
    },
  },
  redact: {
    paths: [
      'password',
      'client_secret',
      'clientSecretEnc',
      'authorization',
      '*.authorization',
      'cookie',
      'MEDIA_SERVICE_TOKEN',
      'MEDIA_JWT_SECRET',
      'SECRET_KEY',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'bebe-media' },
})
