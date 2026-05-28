import { timingSafeEqual } from 'node:crypto'
import { MediaHttpError } from './error-handler'

function getExpected(): string {
  const raw = process.env.MEDIA_SERVICE_TOKEN
  if (!raw || raw.length < 32) {
    throw new Error('MEDIA_SERVICE_TOKEN must be at least 32 bytes')
  }
  return raw
}

function unauthorized(): MediaHttpError {
  return new MediaHttpError({
    code: 'UNAUTHORIZED',
    status: 401,
    message: '서비스 토큰이 없거나 유효하지 않아요',
    retriable: false,
  })
}

export function assertServiceToken(authHeader: string | undefined): void {
  const expected = getExpected()
  const prefix = 'Bearer '
  if (!authHeader || !authHeader.startsWith(prefix)) {
    throw unauthorized()
  }
  const provided = authHeader.slice(prefix.length)
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws if buffer lengths differ — early-return preserves
  // the constant-time guarantee for equal-length inputs.
  if (a.length !== b.length) {
    throw unauthorized()
  }
  if (!timingSafeEqual(a, b)) {
    throw unauthorized()
  }
}
