import { getAuth } from '@/lib/auth'
import { auth } from '@/lib/auth-config'
import { prismaPublic } from '@/lib/db-init'
import { publicOrigin } from '@/lib/request-origin'
import { revokeWidgetTokens } from '@/server/widget/token'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  // 세션을 지우기 전에 누구인지 읽어 둔다 — 위젯 bearer 토큰은 세션이 아니라 사용자에 매여 있어
  // 따로 지워야 한다(안 지우면 로그아웃한 기기의 홈 위젯이 계속 사진을 받는다).
  const { session } = await getAuth()

  // Invalidates the session row and clears the cookie (nextCookies forwards the
  // Set-Cookie). Safe to call without an active session.
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // No active session — nothing to invalidate.
  }
  if (session) await revokeWidgetTokens(session.userId, prismaPublic)

  // Browser HTML form submits (Accept: text/html) → 303 to /login.
  // fetch() callers with JSON Accept get the JSON body.
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    const origin = publicOrigin(req, new URL(req.url).origin)
    return NextResponse.redirect(new URL('/login', origin), { status: 303 })
  }
  return NextResponse.json({ ok: true })
}
