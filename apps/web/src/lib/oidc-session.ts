import { auth } from '@/lib/auth-config'
import { cookies } from 'next/headers'

/**
 * Mints a Better Auth session for an already-verified identity (비밀번호 검증을 이미
 * 마친 신원 — OIDC·아이디 가입/로그인) and
 * writes the session-token cookie. There is no password, so we cannot use
 * signInEmail; instead we go through Better Auth's internal adapter (the same
 * path signInEmail uses to create the session row) and then sign the cookie
 * exactly the way Better Auth does (better-call's signed-cookie format:
 * `encodeURIComponent(token + "." + base64(HMAC-SHA256(token, secret)))`).
 *
 * The signature round-trip is covered by oidc-session.test.ts, which feeds the
 * produced cookie back through auth.api.getSession — if the format ever drifts
 * from Better Auth's reader, that test fails.
 */
export async function createSessionAndSetCookie(
  userId: string,
  currentFamilyId: string | null,
): Promise<void> {
  const ctx = await auth.$context

  const session = await ctx.internalAdapter.createSession(userId, false, {
    ...(currentFamilyId ? { currentFamilyId } : {}),
  })

  const cookieValue = await signCookieValue(session.token, ctx.secret)
  const { name, attributes } = ctx.authCookies.sessionToken

  const store = await cookies()
  store.set(name, cookieValue, {
    httpOnly: attributes.httpOnly ?? true,
    sameSite: (attributes.sameSite as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
    secure: attributes.secure ?? false,
    path: attributes.path ?? '/',
    maxAge: ctx.sessionConfig.expiresIn,
  })
}

async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
  return encodeURIComponent(`${value}.${signature}`)
}
