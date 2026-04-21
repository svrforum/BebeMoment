import { lucia } from '@/lib/auth'
import { decryptSecret } from '@/lib/crypto'
import { prisma } from '@/lib/db-init'
import { exchangeCodeForTokens, fetchUserInfo, linkOrCreateUser } from '@/server/oidc/callback'
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
  if (state !== expectedState) {
    return NextResponse.redirect(new URL('/login?error=state', req.url))
  }

  const provider = await prisma.oidcProvider.findUnique({ where: { id: providerId } })
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
    const info = await fetchUserInfo(disc.userinfo_endpoint, tokens.access_token)
    const user = await linkOrCreateUser(
      {
        providerId,
        subject: info.sub,
        ...(info.email !== undefined ? { email: info.email } : {}),
        ...(info.name !== undefined ? { displayName: info.name } : {}),
      },
      prisma,
    )

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, deletedAt: null },
      orderBy: { joinedAt: 'asc' },
    })
    const session = await lucia.createSession(user.id, {
      currentFamilyId: membership?.familyId ?? null,
    })
    const c = lucia.createSessionCookie(session.id)
    cookieStore.set(c.name, c.value, c.attributes)

    cookieStore.delete('oidc_state')
    cookieStore.delete('oidc_nonce')

    return NextResponse.redirect(new URL('/', req.url))
  } catch (e) {
    console.error('OIDC callback error:', e)
    return NextResponse.redirect(new URL('/login?error=oidc_exchange', req.url))
  }
}
