import pino from 'pino'

const level = process.env.LOG_LEVEL ?? 'info'

export const logger = pino({
  level,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'client_secret',
      'clientSecretEnc',
      'SECRET_KEY',
      'secretKey',
      'MEDIA_JWT_SECRET',
      'MEDIA_SERVICE_TOKEN',
      'token',
      '*.token',
      'authorization',
      '*.authorization',
      'cookie',
      'set-cookie',
      '*.cookie',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
})
