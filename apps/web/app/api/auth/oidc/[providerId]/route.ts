import crypto from 'node:crypto'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { decryptSecret } from '@/lib/crypto'
import { prisma } from '@/lib/db-init'
import { fetchDiscovery } from '@/server/oidc/discovery'

export async function GET(_req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params
  const env = parseEnv(process.env as Record<string, string | undefined>)

  const provider = await prisma.oidcProvider.findUnique({ where: { id: providerId } })
  if (!provider || !provider.enabled) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }

  const disc = await fetchDiscovery(provider.issuer)
  const state = crypto.randomBytes(16).toString('base64url')
  const nonce = crypto.randomBytes(16).toString('base64url')

  const redirectUri = `${env.PUBLIC_URL}/api/auth/oidc/${providerId}/callback`

  const query = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    scope: provider.scopes.join(' '),
    state,
    nonce,
  })

  const cookieStore = await cookies()
  cookieStore.set('oidc_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })
  cookieStore.set('oidc_nonce', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })

  await decryptSecret(provider.clientSecretEnc, env.SECRET_KEY)

  return NextResponse.redirect(`${disc.authorization_endpoint}?${query.toString()}`)
}
