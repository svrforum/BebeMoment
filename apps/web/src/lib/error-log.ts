/**
 * API 에러 응답을 로그로 남길 때 쓰는 형태.
 *
 * Next 는 요청을 로그로 남기지 않아서, 라우트가 4xx·5xx 를 돌려줘도 서버엔 아무 흔적이
 * 없었다. 스토리 생성이 400 으로 거절되던 것도, 휴지통 영구삭제가 매번 500 이던 것도
 * 서버 로그만 봐서는 알 수 없어 매번 재현부터 해야 했다. errorJson 이 이 필드로 남긴다.
 */
export type LogLevel = 'info' | 'warn' | 'error'

export function levelForStatus(status: number): LogLevel {
  if (status >= 500) return 'error'
  // 로그인 안 한 요청은 늘 있다 — warn 으로 채우면 진짜 문제가 묻힌다.
  if (status === 401) return 'info'
  return 'warn'
}

/** 경로에 실린 토큰을 지운다 — 로그가 짧은 TTL 동안 탈취 경로가 되지 않게(media 와 동일). */
function sanitizePath(path: string): string {
  return path
    .replace(/([?&](token|signed)=)[^&]+/gi, '$1[redacted]')
    .replace(/\/(files|download)\/[^/?]+/g, '/$1/[token]')
}

export function errorLogFields(input: {
  status: number
  message: string
  path?: string | null
  error?: unknown
}): Record<string, unknown> {
  const stack =
    input.status >= 500 && input.error instanceof Error
      ? input.error.stack?.split('\n').slice(0, 6).join(' | ').slice(0, 600)
      : undefined
  return {
    status: input.status,
    path: input.path ? sanitizePath(input.path) : 'unknown',
    err: input.message.replace(/\s+/g, ' ').trim().slice(0, 300),
    ...(stack ? { stack } : {}),
  }
}
