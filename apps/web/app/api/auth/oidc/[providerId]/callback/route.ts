import { resolveLocale } from '@/i18n/request'
import { getServerTranslator } from '@/i18n/translator'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { logger } from '@/lib/logger'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { publicOrigin } from '@/lib/request-origin'
import { renderAppHandoffPage } from '@/server/oidc/app-handoff-page'
import { completeOidcCallback } from '@/server/oidc/complete-login'
import { fetchProviderIdentity } from '@/server/oidc/identity'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const FLOW_COOKIES = [
  'oidc_state',
  'oidc_nonce',
  'oidc_invite',
  'oidc_link',
  'oidc_name',
  'oidc_app_challenge',
  'oidc_next',
] as const

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const url = new URL(req.url)
  const store = await cookies()
  const read = (name: (typeof FLOW_COOKIES)[number]) => store.get(name)?.value
  // 모든 리다이렉트는 접속한 공개 오리진(도메인) 기준 — req.url 은 프록시 뒤에서 내부
  // 주소(0.0.0.0:3000)라 그대로 쓰면 엉뚱한 곳으로 튕긴다.
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const origin = publicOrigin(req, env.PUBLIC_URL)
  const { providerId } = await params

  const outcome = await completeOidcCallback(
    {
      providerId,
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
      redirectUri: `${origin}/api/auth/oidc/${providerId}/callback`,
      cookies: {
        state: read('oidc_state'),
        nonce: read('oidc_nonce'),
        invite: read('oidc_invite'),
        link: read('oidc_link'),
        name: read('oidc_name'),
        appChallenge: read('oidc_app_challenge'),
        next: read('oidc_next'),
      },
    },
    {
      prisma: prismaPublic,
      secretKey: env.SECRET_KEY,
      fetchIdentity: fetchProviderIdentity,
      sessionUserId: async () => (await getAuth()).session?.userId ?? null,
    },
  )
  for (const name of FLOW_COOKIES) store.delete(name)

  if (outcome.kind === 'fail') {
    return NextResponse.redirect(new URL(`/login?error=${outcome.error}`, origin))
  }
  if (outcome.kind === 'redirect') return NextResponse.redirect(new URL(outcome.to, origin))

  try {
    // 앱(Custom Tab)은 외부 브라우저 쿠키 jar 를 쓰므로 세션 쿠키 대신 1회용 코드를 앱에 넘긴다.
    if (outcome.kind === 'handoff') {
      const locale = await resolveLocale()
      const html = renderAppHandoffPage(outcome.code, locale, getServerTranslator(locale, 'auth'))
      return new NextResponse(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    await createSessionAndSetCookie(outcome.userId, outcome.currentFamilyId)
    return NextResponse.redirect(new URL(outcome.to, origin))
  } catch (err) {
    logger.error({ err, providerId }, 'oidc callback: finishing sign-in failed')
    return NextResponse.redirect(new URL('/login?error=oidc_exchange', origin))
  }
}
