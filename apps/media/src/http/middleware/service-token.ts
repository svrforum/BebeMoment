import { MediaHttpError } from './error-handler'

function getExpected(): string {
  const raw = process.env.MEDIA_SERVICE_TOKEN
  if (!raw || raw.length < 32) {
    throw new Error('MEDIA_SERVICE_TOKEN must be at least 32 bytes')
  }
  return raw
}

export function assertServiceToken(authHeader: string | undefined): void {
  const expected = getExpected()
  const prefix = 'Bearer '
  if (
    !authHeader ||
    !authHeader.startsWith(prefix) ||
    authHeader.slice(prefix.length) !== expected
  ) {
    throw new MediaHttpError({
      code: 'UNAUTHORIZED',
      status: 401,
      message: '서비스 토큰이 없거나 유효하지 않아요',
      retriable: false,
    })
  }
}
