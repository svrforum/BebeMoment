/**
 * Better Auth catch-all(`/api/auth/[...all]`)에서 404 로 막아야 하는 네이티브 자격증명
 * 엔드포인트인지. 가입/로그인은 커스텀 라우트(`/api/auth/{signup,login}`)로만 처리하므로
 * BA 의 `/sign-up/email`·`/sign-in/email` 은 절대 노출하면 안 된다 — 이들은 가입 게이트
 * (가족 0개 또는 유효 초대), 정지 enforce, 계정별 브루트포스 레이트리밋을 전부 우회한다.
 * get-session·sign-out·callback 등 다른 BA 엔드포인트는 그대로 통과.
 */
export function isBlockedBetterAuthPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '')
  return p.endsWith('/sign-up/email') || p.endsWith('/sign-in/email')
}
