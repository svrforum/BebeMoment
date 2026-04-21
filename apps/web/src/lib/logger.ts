import pino from 'pino'

const level = process.env.LOG_LEVEL ?? 'info'

export const logger = pino({
  level,
  redact: {
    paths: ['password', 'passwordHash', 'client_secret', 'clientSecretEnc', 'authorization', '*.authorization', 'cookie'],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
})
