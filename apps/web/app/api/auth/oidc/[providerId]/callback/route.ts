import { decryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { createOidcSessionAndSetCookie } from '@/lib/oidc-session'
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  linkOrCreateUser,
  verifyIdToken,
} from '@/server/oidc/callback'
import { fetchDiscovery } from '@/server/oidc/discovery'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=oidc', req.url))
  }

  const { providerId } = await params
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('oidc_state')?.value
  const expectedNonce = cookieStore.get('oidc_nonce')?.value
  if (state !== expectedState) {
    return NextResponse.redirect(new URL('/login?error=state', req.url))
  }

  const provider = await prismaPublic.oidcProvider.findUnique({ where: { id: providerId } })
  if (!provider || !provider.enabled) {
    return NextResponse.redirect(new URL('/login?error=provider', req.url))
  }

  const disc = await fetchDiscovery(provider.issuer)
  const clientSecret = await decryptSecret(provider.clientSecretEnc, env.SECRET_KEY)
  const redirectUri = `${env.PUBLIC_URL}/api/auth/oidc/${providerId}/callback`

  try {
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: disc.token_endpoint,
      code,
      redirectUri,
      clientId: provider.clientId,
      clientSecret,
    })

    // Verify id_token signature + claims + nonce before trusting anything.
    const idTokenPayload = await verifyIdToken(tokens.id_token, {
      jwksUri: disc.jwks_uri,
      issuer: provider.issuer,
      clientId: provider.clientId,
      nonce: expectedNonce,
    })

    const info = await fetchUserInfo(disc.userinfo_endpoint, tokens.access_token)

    // id_token is authoritative for sub and email_verified; userinfo fills display name.
    const subject = String(idTokenPayload.sub ?? info.sub)
    const email = (idTokenPayload.email as string | undefined) ?? info.email
    const emailVerified =
      (idTokenPayload.email_verified as boolean | undefined) ?? info.email_verified ?? false

    const user = await linkOrCreateUser(
      {
        providerId,
        subject,
        ...(email !== undefined ? { email } : {}),
        emailVerified,
        ...(info.name !== undefined ? { displayName: info.name } : {}),
      },
      prismaPublic,
    )

    const membership = await prismaPublic.membership.findFirst({
      where: { userId: user.id, deletedAt: null },
      orderBy: { joinedAt: 'asc' },
    })
    await createOidcSessionAndSetCookie(user.id, membership?.familyId ?? null)

    cookieStore.delete('oidc_state')
    cookieStore.delete('oidc_nonce')

    return NextResponse.redirect(new URL('/', req.url))
  } catch (e) {
    console.error('OIDC callback error:', e)
    return NextResponse.redirect(new URL('/login?error=oidc_exchange', req.url))
  }
}
