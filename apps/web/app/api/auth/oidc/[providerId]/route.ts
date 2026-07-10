import crypto from 'node:crypto'
import { prismaPublic } from '@/lib/db-init'
import { publicOrigin } from '@/lib/request-origin'
import { fetchDiscovery } from '@/server/oidc/discovery'
import { NAVER_AUTHORIZE } from '@/server/oidc/naver'
import { parseEnv } from '@bebe/config'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const origin = publicOrigin(req, env.PUBLIC_URL)
  // 이 라우트는 전체 페이지 네비게이션(<a href>)으로 진입 — 실패를 JSON/500 으로 던지면
  // 브라우저에 날 JSON/에러 화면이 뜬다. 항상 로그인 화면으로 되돌려 코드로 안내한다.
  const loginError = (code: string) =>
    NextResponse.redirect(new URL(`/login?error=${code}`, origin))

  // providerId 는 UUID 컬럼 — 형식이 안 맞으면 Prisma 가 던진다(500). 먼저 거른다.
  if (!UUID_RE.test(providerId)) return loginError('provider')

  let provider: Awaited<ReturnType<typeof prismaPublic.oidcProvider.findUnique>>
  try {
    provider = await prismaPublic.oidcProvider.findUnique({ where: { id: providerId } })
  } catch {
    return loginError('oidc')
  }
  if (!provider?.enabled) return loginError('provider')

  const state = crypto.randomBytes(16).toString('base64url')
  const redirectUri = `${origin}/api/auth/oidc/${providerId}/callback`
  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  }
  cookieStore.set('oidc_state', state, cookieOpts)

  const reqUrl = new URL(req.url)
  const inviteToken = reqUrl.searchParams.get('invite')
  if (inviteToken) cookieStore.set('oidc_invite', inviteToken, cookieOpts)

  // 로그인 후 복귀할 경로(공유 링크 등) — 콜백이 oidc_next 를 읽어 거기로 보낸다.
  // 같은-출처 절대경로만(//·/\ 프로토콜-상대 우회 차단).
  const nextParam = reqUrl.searchParams.get('next')
  if (nextParam && /^\/(?![/\\])/.test(nextParam))
    cookieStore.set('oidc_next', nextParam, cookieOpts)

  // 초대 가입 시 사용자가 직접 고른 표시 이름 — 콜백이 신규 유저 생성에만 적용(SNS 자동 이름 대체).
  const chosenName = reqUrl.searchParams.get('name')?.trim()
  if (chosenName) cookieStore.set('oidc_name', chosenName.slice(0, 60), cookieOpts)

  // 앱(Custom Tab) 플로우 — challenge(=sha256(verifier))가 오면 콜백이 세션 쿠키 대신
  // 1회용 핸드오프 코드를 발급해 bebe://auth 딥링크로 앱에 돌려준다(§SNS 앱 로그인).
  const appChallenge = reqUrl.searchParams.get('app_challenge')
  if (appChallenge) cookieStore.set('oidc_app_challenge', appChallenge.slice(0, 200), cookieOpts)

  // 계정 연동 모드 — 콜백이 이 쿠키를 보면 새 로그인 대신 현재 로그인 사용자에게
  // 신원을 연결한다(세션은 콜백에서 검증).
  if (reqUrl.searchParams.get('link') === '1') cookieStore.set('oidc_link', '1', cookieOpts)

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

  // 표준 OIDC: discovery + nonce. discovery 는 IdP 로의 네트워크 호출이라 실패할 수 있다 —
  // 던지면 500 이므로 로그인 화면으로 되돌린다(§조용한 실패 금지: 코드로 안내).
  let disc: Awaited<ReturnType<typeof fetchDiscovery>>
  try {
    disc = await fetchDiscovery(provider.issuer)
  } catch {
    return loginError('oidc')
  }
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
