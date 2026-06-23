import crypto from 'node:crypto'
import type { PrismaClient, User } from '@bebe/db-public'
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose'

export type TokenExchangeResult = {
  id_token: string
  access_token: string
}

export type UserInfo = {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  // 카카오 등 일부 IdP 는 표시이름을 `name` 이 아니라 `nickname` 으로 준다.
  nickname?: string
  picture?: string
}

export async function exchangeCodeForTokens(args: {
  tokenEndpoint: string
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  })
  const res = await fetch(args.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return (await res.json()) as TokenExchangeResult
}

export async function verifyIdToken(
  idToken: string,
  args: { jwksUri: string; issuer: string; clientId: string; nonce: string | undefined },
): Promise<JWTPayload> {
  const jwks = createRemoteJWKSet(new URL(args.jwksUri))
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: args.issuer,
    audience: args.clientId,
    // 비대칭 서명만 허용 — alg=none/HS 대칭키 혼동으로 email_verified 등을 위조하지 못하게.
    // 카카오·구글 등 표준 IdP 는 RS256 이라 정상 로그인엔 영향 없음(위조 토큰만 차단).
    algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'],
  })
  if (args.nonce && payload.nonce !== args.nonce) {
    throw new Error('id_token nonce mismatch')
  }
  return payload
}

export async function fetchUserInfo(endpoint: string, accessToken: string): Promise<UserInfo> {
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`UserInfo failed: ${res.status}`)
  return (await res.json()) as UserInfo
}

export type LinkOrCreateInput = {
  providerId: string
  subject: string
  email?: string
  emailVerified: boolean
  displayName?: string
}

export async function findLinkedUser(
  args: LinkOrCreateInput,
  prisma: PrismaClient,
): Promise<User | null> {
  const identity = await prisma.oidcIdentity.findUnique({
    where: { providerId_subject: { providerId: args.providerId, subject: args.subject } },
    include: { user: true },
  })
  if (identity) return identity.user
  if (args.email && args.emailVerified) {
    const existingUser = await prisma.user.findUnique({ where: { email: args.email } })
    // 기존 로컬 계정도 이메일이 검증된 경우에만 병합한다. 커스텀 가입(비번) 계정의 이메일은
    // 사용자가 입력만 한 미검증 값이라, 들어온 IdP 의 email_verified 만 믿고 병합하면 계정
    // 탈취(pre-account-takeover) 가 된다.
    if (existingUser?.emailVerified) return existingUser
  }
  return null
}

export async function linkOrCreateUser(
  args: LinkOrCreateInput,
  prisma: PrismaClient,
): Promise<{ user: User; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.oidcIdentity.findUnique({
      where: { providerId_subject: { providerId: args.providerId, subject: args.subject } },
      include: { user: true },
    })
    if (identity) return { user: identity.user, created: false }

    if (args.email && args.emailVerified) {
      const existingUser = await tx.user.findUnique({ where: { email: args.email } })
      // findLinkedUser 와 동일 — 기존 계정도 이메일 검증된 경우에만 병합(계정 탈취 방지).
      if (existingUser?.emailVerified) {
        await tx.oidcIdentity.create({
          data: {
            userId: existingUser.id,
            providerId: args.providerId,
            subject: args.subject,
            email: args.email,
          },
        })
        return { user: existingUser, created: false }
      }
    }

    const user = await tx.user.create({
      data: {
        email: args.email ?? null,
        emailVerified: args.emailVerified === true,
        displayName:
          args.displayName ?? args.email ?? `user-${crypto.randomBytes(4).toString('hex')}`,
      },
    })
    await tx.oidcIdentity.create({
      data: {
        userId: user.id,
        providerId: args.providerId,
        subject: args.subject,
        email: args.email ?? null,
      },
    })
    return { user, created: true }
  })
}
