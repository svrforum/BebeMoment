// 네이버 로그인은 OAuth2 전용(OIDC 아님) — discovery·id_token·JWKS 없음. 고정
// 엔드포인트로 code→token 교환 후 `/v1/nid/me` 에서 프로필을 받아 `response` 를 언랩한다.
// 공식: https://developers.naver.com/docs/login/api/api.md

export const NAVER_AUTHORIZE = 'https://nid.naver.com/oauth2.0/authorize'
export const NAVER_TOKEN = 'https://nid.naver.com/oauth2.0/token'
export const NAVER_USERINFO = 'https://openapi.naver.com/v1/nid/me'

export type NaverProfile = {
  sub: string
  email?: string
  emailVerified: boolean
  displayName?: string
}

export async function exchangeNaverCode(args: {
  code: string
  state: string
  clientId: string
  clientSecret: string
}): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    state: args.state,
  })
  const res = await fetch(NAVER_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Naver token exchange failed: ${res.status}`)
  const json = (await res.json()) as { access_token?: string; error?: string }
  if (!json.access_token)
    throw new Error(`Naver token response missing access_token: ${json.error ?? ''}`)
  return { access_token: json.access_token }
}

type NaverMeResponse = {
  resultcode: string
  message: string
  response?: {
    id: string
    email?: string
    name?: string
    nickname?: string
  }
}

export async function fetchNaverProfile(accessToken: string): Promise<NaverProfile> {
  const res = await fetch(NAVER_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Naver profile failed: ${res.status}`)
  const json = (await res.json()) as NaverMeResponse
  if (json.resultcode !== '00' || !json.response) {
    throw new Error(`Naver profile error: ${json.message}`)
  }
  const r = json.response
  return {
    sub: r.id,
    ...(r.email ? { email: r.email } : {}),
    // 네이버 응답엔 표준 email_verified 클레임이 없다. 이메일 존재를 검증으로 간주하면
    // (callback 의 email 일치 자동병합 경로를 타) 같은 이메일을 가진 기존 로컬 계정에
    // 네이버 로그인이 붙어 계정 탈취가 가능하다. 검증으로 신뢰하지 않고 (providerId,
    // subject)로만 연결한다(이메일은 신규 유저 기록용으로만 저장).
    emailVerified: false,
    ...(r.nickname || r.name ? { displayName: r.nickname ?? r.name } : {}),
  }
}
