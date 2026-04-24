import { parseEnv } from '@bebe/config'
import pino from 'pino'

const env = parseEnv(process.env as Record<string, string | undefined>)

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
