import { getAuth } from '@/lib/auth'
import { decryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { publicOrigin } from '@/lib/request-origin'
import { linkIdentityToUser } from '@/server/oidc/link'
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  findLinkedUser,
  linkOrCreateUser,
  verifyIdToken,
} from '@/server/oidc/callback'
import { fetchDiscovery } from '@/server/oidc/discovery'
import { exchangeNaverCode, fetchNaverProfile } from '@/server/oidc/naver'
import { isRegistrationOpen, validateInviteForSignup } from '@/server/auth/registration'
import { isUserFullySuspended } from '@/server/auth/suspension'
import { acceptInvite } from '@/server/invite/accept'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function clearOidcCookies(store: Awaited<ReturnType<typeof cookies>>): void {
  store.delete('oidc_state')
  store.delete('oidc_nonce')
  store.delete('oidc_invite')
  store.delete('oidc_link')
}

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = await cookies()
  // 모든 리다이렉트는 접속한 공개 오리진(도메인) 기준 — req.url 은 프록시 뒤에서 내부
  // 주소(0.0.0.0:3000)라 그대로 쓰면 엉뚱한 곳으로 튕긴다.
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const origin = publicOrigin(req, env.PUBLIC_URL)
  if (!code || !state) {
    clearOidcCookies(cookieStore)
    return NextResponse.redirect(new URL('/login?error=oidc', origin))
  }

  const { providerId } = await params
  const expectedState = cookieStore.get('oidc_state')?.value
  const expectedNonce = cookieStore.get('oidc_nonce')?.value
  if (state !== expectedState) {
    clearOidcCookies(cookieStore)
    return NextResponse.redirect(new URL('/login?error=state', origin))
  }

  const provider = await prismaPublic.oidcProvider.findUnique({ where: { id: providerId } })
  if (!provider || !provider.enabled) {
    clearOidcCookies(cookieStore)
    return NextResponse.redirect(new URL('/login?error=provider', origin))
  }

  const clientSecret = await decryptSecret(provider.clientSecretEnc, env.SECRET_KEY)
  const redirectUri = `${origin}/api/auth/oidc/${providerId}/callback`

  try {
    let linkInput: {
      providerId: string
      subject: string
      email?: string
      emailVerified: boolean
      displayName?: string
    }

    if (provider.kind === 'naver') {
      // 네이버: OAuth2 전용 — id_token 없음. code→token 후 nid/me 프로필 언랩.
      const { access_token } = await exchangeNaverCode({
        code,
        state,
        clientId: provider.clientId,
        clientSecret,
      })
      const profile = await fetchNaverProfile(access_token)
      linkInput = {
        providerId,
        subject: profile.sub,
        emailVerified: profile.emailVerified,
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.displayName ? { displayName: profile.displayName } : {}),
      }
    } else {
      const disc = await fetchDiscovery(provider.issuer)
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

      // id_token is authoritative for sub and email_verified; userinfo/id_token fill
      // the display name — Kakao 등은 `name` 이 아니라 `nickname` 으로 줘서 둘 다 본다.
      const subject = String(idTokenPayload.sub ?? info.sub)
      const email = (idTokenPayload.email as string | undefined) ?? info.email
      const emailVerified =
        (idTokenPayload.email_verified as boolean | undefined) ?? info.email_verified ?? false
      const displayName =
        info.name ??
        info.nickname ??
        (idTokenPayload.nickname as string | undefined) ??
        (idTokenPayload.name as string | undefined)

      linkInput = {
        providerId,
        subject,
        emailVerified,
        ...(email !== undefined ? { email } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
      }
    }

    // 계정 연동 모드: 현재 로그인 사용자에게 신원만 붙이고 끝낸다(새 로그인/가입 아님).
    if (cookieStore.get('oidc_link')?.value === '1') {
      const { session } = await getAuth()
      if (!session) {
        clearOidcCookies(cookieStore)
        return NextResponse.redirect(new URL('/login?error=link_session', origin))
      }
      const r = await linkIdentityToUser(
        {
          userId: session.userId,
          providerId,
          subject: linkInput.subject,
          ...(linkInput.email ? { email: linkInput.email } : {}),
        },
        prismaPublic,
      )
      clearOidcCookies(cookieStore)
      return NextResponse.redirect(
        new URL(r.conflict ? '/settings?error=link_conflict' : '/settings?linked=1', origin),
      )
    }

    const inviteToken = cookieStore.get('oidc_invite')?.value ?? null

    const existing = await findLinkedUser(linkInput, prismaPublic)
    if (!existing) {
      const open = await isRegistrationOpen(prismaPublic)
      if (!open) {
        const ok = inviteToken ? await validateInviteForSignup(inviteToken, prismaPublic) : false
        if (!ok) {
          clearOidcCookies(cookieStore)
          return NextResponse.redirect(new URL('/login?error=invite_required', origin))
        }
      }
    }

    const { user } = await linkOrCreateUser(linkInput, prismaPublic)

    let currentFamilyId: string | null = null
    if (inviteToken) {
      const existingMembership = await prismaPublic.membership.findFirst({
        where: { userId: user.id, deletedAt: null },
      })
      if (!existingMembership) {
        try {
          const r = await acceptInvite({ token: inviteToken, userId: user.id }, prismaPublic)
          currentFamilyId = r.familyId
        } catch {
          // 초대 만료/취소 — 로그인은 진행(가족 없으면 온보딩/안내로 유도).
        }
      }
    }

    if (!currentFamilyId) {
      const membership = await prismaPublic.membership.findFirst({
        where: { userId: user.id, deletedAt: null },
        orderBy: { joinedAt: 'asc' },
      })
      currentFamilyId = membership?.familyId ?? null
    }

    if (await isUserFullySuspended(user.id, prismaPublic)) {
      clearOidcCookies(cookieStore)
      return NextResponse.redirect(new URL('/login?error=suspended', origin))
    }

    await createSessionAndSetCookie(user.id, currentFamilyId)

    clearOidcCookies(cookieStore)

    return NextResponse.redirect(new URL('/', origin))
  } catch (e) {
    console.error('OIDC callback error:', e)
    clearOidcCookies(cookieStore)
    return NextResponse.redirect(new URL('/login?error=oidc_exchange', origin))
  }
}
