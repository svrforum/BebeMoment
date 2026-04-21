import crypto from 'node:crypto'
import type { PrismaClient, User } from '@bebe/db'

export type TokenExchangeResult = {
  id_token: string
  access_token: string
}

export type UserInfo = {
  sub: string
  email?: string
  name?: string
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

export async function fetchUserInfo(endpoint: string, accessToken: string): Promise<UserInfo> {
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`UserInfo failed: ${res.status}`)
  return (await res.json()) as UserInfo
}

export async function linkOrCreateUser(
  args: {
    providerId: string
    subject: string
    email?: string
    displayName?: string
  },
  prisma: PrismaClient,
): Promise<User> {
  const identity = await prisma.oidcIdentity.findUnique({
    where: { providerId_subject: { providerId: args.providerId, subject: args.subject } },
    include: { user: true },
  })
  if (identity) return identity.user

  if (args.email) {
    const existingUser = await prisma.user.findUnique({ where: { email: args.email } })
    if (existingUser) {
      await prisma.oidcIdentity.create({
        data: {
          userId: existingUser.id,
          providerId: args.providerId,
          subject: args.subject,
          email: args.email,
        },
      })
      return existingUser
    }
  }

  const user = await prisma.user.create({
    data: {
      email: args.email ?? null,
      emailVerified: true,
      displayName:
        args.displayName ?? args.email ?? `user-${crypto.randomBytes(4).toString('hex')}`,
    },
  })
  await prisma.oidcIdentity.create({
    data: {
      userId: user.id,
      providerId: args.providerId,
      subject: args.subject,
      email: args.email ?? null,
    },
  })
  return user
}
