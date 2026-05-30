import { parseEnv } from '@bebe/config'
import pino from 'pino'

const env = parseEnv(process.env as Record<string, string | undefined>)

// 서명 토큰은 URL 에 실린다(/files/<jwt>, /download/<signed>, ?token=). 요청 로그에
// 그대로 남으면 짧은 TTL 동안 토큰 탈취 경로가 되므로 로깅 직전에 마스킹한다. (Fastify 의
// 기본 req serializer 는 pino 인스턴스 serializer 를 무시하므로, server.ts 가
// disableRequestLogging + onResponse 훅에서 이 함수로 url 을 마스킹해 로깅한다.)
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url
  return url
    .replace(/\/(files|download)\/[^/?]+/g, '/$1/[token]')
    .replace(/([?&]token=)[^&]+/g, '$1[redacted]')
}

export const logger = pino({
  level: env.LOG_LEVEL,
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
