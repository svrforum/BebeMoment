import type { JWTPayload } from 'jose'
import {
  type LinkOrCreateInput,
  type UserInfo,
  exchangeCodeForTokens,
  fetchUserInfo,
  verifyIdToken,
} from './callback'
import { fetchDiscovery } from './discovery'
import { exchangeNaverCode, fetchNaverProfile } from './naver'

type ProviderRef = { issuer: string; clientId: string }

// 표준 OIDC 쪽은 nonce 를 반드시 들고 온다 — 없는 채로는 이 요청을 만들 수 없게 타입으로 막는다.
export type IdentityRequest =
  | { kind: 'naver'; provider: ProviderRef; code: string; state: string; clientSecret: string }
  | {
      kind: 'oidc'
      provider: ProviderRef
      code: string
      nonce: string
      clientSecret: string
      redirectUri: string
    }

export type VerifiedIdentity = Omit<LinkOrCreateInput, 'providerId'>

export async function fetchProviderIdentity(req: IdentityRequest): Promise<VerifiedIdentity> {
  if (req.kind === 'naver') {
    // 네이버: OAuth2 전용 — id_token 없음. code→token 후 nid/me 프로필 언랩.
    const { access_token } = await exchangeNaverCode({
      code: req.code,
      state: req.state,
      clientId: req.provider.clientId,
      clientSecret: req.clientSecret,
    })
    const profile = await fetchNaverProfile(access_token)
    return {
      subject: profile.sub,
      emailVerified: profile.emailVerified,
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
    }
  }

  const disc = await fetchDiscovery(req.provider.issuer)
  const tokens = await exchangeCodeForTokens({
    tokenEndpoint: disc.token_endpoint,
    code: req.code,
    redirectUri: req.redirectUri,
    clientId: req.provider.clientId,
    clientSecret: req.clientSecret,
  })
  const idToken = await verifyIdToken(tokens.id_token, {
    jwksUri: disc.jwks_uri,
    issuer: req.provider.issuer,
    clientId: req.provider.clientId,
    nonce: req.nonce,
  })
  const info = await fetchUserInfo(disc.userinfo_endpoint, tokens.access_token)
  return identityFromClaims(idToken, info)
}

// id_token 이 sub·email·email_verified 의 근거다(서명 검증됨). 표시 이름은 userinfo 를 먼저 보고,
// 카카오 등은 `name` 이 아니라 `nickname` 으로 줘서 둘 다 본다.
export function identityFromClaims(idToken: JWTPayload, info: UserInfo): VerifiedIdentity {
  const subject = String(idToken.sub ?? info.sub)
  const email = (idToken.email as string | undefined) ?? info.email
  const emailVerified =
    (idToken.email_verified as boolean | undefined) ?? info.email_verified ?? false
  const displayName =
    info.name ??
    info.nickname ??
    (idToken.nickname as string | undefined) ??
    (idToken.name as string | undefined)
  return {
    subject,
    emailVerified,
    ...(email !== undefined ? { email } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
  }
}
