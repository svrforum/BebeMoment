/**
 * Better Auth catch-all(`/api/auth/[...all]`)이 실제로 노출해도 되는 엔드포인트 — allowlist.
 *
 * 브라우저도 안드로이드 앱도 BA 를 HTTP 로 부르지 않는다(서버가 `auth.api.getSession`·
 * `auth.api.signOut`·`internalAdapter.createSession` 을 직접 쓴다). 그런데 catch-all 은 BA 의
 * 엔드포인트 25개쯤을 전부 마운트했고, `/sign-up/email`·`/sign-in/email` 두 개만 거부하고
 * 있었다 — `/update-user` 로는 아무 멤버나 name/image 를 검증 없이 바꿀 수 있었다. 가입/로그인은
 * 커스텀 라우트(`/api/auth/{signup,login}`)만이 가입 게이트·정지 enforce·계정별 레이트리밋을
 * 지나므로, 여기서는 세션 조회·로그아웃·헬스체크만 남기고 나머지는 404 다.
 */
const ALLOWED_SUBPATHS = new Set(['/get-session', '/sign-out', '/ok'])

export function isAllowedBetterAuthPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '')
  const at = p.indexOf('/api/auth/')
  if (at === -1) return false
  return ALLOWED_SUBPATHS.has(p.slice(at + '/api/auth'.length))
}
