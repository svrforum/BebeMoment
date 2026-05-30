/**
 * 요청이 실제로 들어온 공개 오리진(스킴+호스트). 리버스 프록시 뒤(도메인)면
 * `x-forwarded-*` 헤더를, 아니면 `host` 를 쓴다. 둘 다 없으면 fallback(PUBLIC_URL).
 * OIDC redirect_uri 가 사용자가 접속한 도메인과 일치하게 해 IP/도메인 혼용 문제를 막는다.
 */
export function publicOrigin(req: Request, fallback: string): string {
  const proto = (req.headers.get('x-forwarded-proto') ?? '').split(',')[0]?.trim()
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(',')[0]
    ?.trim()
  if (host) return `${proto || 'https'}://${host}`
  return fallback.replace(/\/+$/, '')
}
