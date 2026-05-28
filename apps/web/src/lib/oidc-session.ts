import { auth } from '@/lib/auth-config'
import { prismaPublic } from '@/lib/db-init'
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
 * NOTE: we return the RAW `token.signature` — Next.js `cookies().set()` URL-encodes
 * the value itself, so an extra encodeURIComponent here would double-encode
 * (base64 `=` → `%3D` → `%253D`) and Better Auth's reader would reject it. The
 * browser therefore receives a single-encoded cookie, matching what getSession
 * expects. oidc-session.test.ts simulates the browser-sent (single-encoded)
 * cookie via encodeURIComponent and feeds it to getSession.
 *
 * Callers MUST resolve `currentFamilyId` themselves (membership lookup) and
 * pass it in. The function stamps it on the EXACT session row it just created
 * (by id) — never via `findFirst({ orderBy: createdAt desc })`, which under
 * concurrent logins could hit somebody else's session.
 */
export async function createSessionAndSetCookie(
  userId: string,
  currentFamilyId: string | null,
): Promise<void> {
  const ctx = await auth.$context

  const session = await ctx.internalAdapter.createSession(userId, false, {
    ...(currentFamilyId ? { currentFamilyId } : {}),
  })

  // additionalFields.currentFamilyId 의 `input: false` 때문에 internalAdapter 가
  // 3rd-arg 의 currentFamilyId 를 drop 할 수 있어, 방금 만든 세션 id 로 한 번 더
  // 박는다 (timestamp 정렬 findFirst 대체 — 동시 로그인 race-safe).
  if (currentFamilyId) {
    await prismaPublic.session.update({
      where: { id: session.id },
      data: { currentFamilyId },
    })
  }

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
  // Raw — Next's cookies().set() URL-encodes the value once (see doc comment).
  return `${value}.${signature}`
}
