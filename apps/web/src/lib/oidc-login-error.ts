// OIDC 로그인 실패 시 콜백/시작 라우트가 `/login?error=<code>` 로 되돌린다. 로그인 화면이
// 그 코드를 사람이 읽을 메시지(auth.login.error.<key>)로 매핑해 조용한 실패를 없앤다.
// 모르는 코드는 일반 메시지로 폴백 — 어떤 경우에도 빈 화면으로 끝나지 않게.
const CODE_TO_KEY: Record<string, string> = {
  oidc: 'oidc',
  oidc_exchange: 'oidc',
  nonce: 'oidc',
  link_session: 'oidc',
  state: 'state',
  provider: 'provider',
  invite_required: 'inviteRequired',
  setup_required: 'setupRequired',
  suspended: 'suspended',
}

export function oidcLoginErrorKey(code: string | null | undefined): string | null {
  if (!code) return null
  return CODE_TO_KEY[code] ?? 'oidc'
}
