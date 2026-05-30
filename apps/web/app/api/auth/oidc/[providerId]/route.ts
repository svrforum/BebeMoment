import crypto from 'node:crypto'
import { prismaPublic } from '@/lib/db-init'
import { fetchDiscovery } from '@/server/oidc/discovery'
import { NAVER_AUTHORIZE } from '@/server/oidc/naver'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params
  const env = parseEnv(process.env as Record<string, string | undefined>)

  const provider = await prismaPublic.oidcProvider.findUnique({ where: { id: providerId } })
  if (!provider || !provider.enabled) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }

  const state = crypto.randomBytes(16).toString('base64url')
  const redirectUri = `${env.PUBLIC_URL}/api/auth/oidc/${providerId}/callback`
  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  }
  cookieStore.set('oidc_state', state, cookieOpts)

  const inviteToken = new URL(req.url).searchParams.get('invite')
  if (inviteToken) cookieStore.set('oidc_invite', inviteToken, cookieOpts)

  // 네이버: OAuth2 전용 — 고정 authorize 엔드포인트, nonce 없음.
  if (provider.kind === 'naver') {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: provider.clientId,
      redirect_uri: redirectUri,
      state,
    })
    return NextResponse.redirect(`${NAVER_AUTHORIZE}?${query.toString()}`)
  }

  // 표준 OIDC: discovery + nonce.
  const disc = await fetchDiscovery(provider.issuer)
  const nonce = crypto.randomBytes(16).toString('base64url')
  cookieStore.set('oidc_nonce', nonce, cookieOpts)
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    scope: provider.scopes.join(' '),
    state,
    nonce,
  })
  return NextResponse.redirect(`${disc.authorization_endpoint}?${query.toString()}`)
}
