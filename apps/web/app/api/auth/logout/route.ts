import { auth } from '@/lib/auth-config'
import { publicOrigin } from '@/lib/request-origin'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  // Invalidates the session row and clears the cookie (nextCookies forwards the
  // Set-Cookie). Safe to call without an active session.
  try {
    await auth.api.signOut({ headers: await headers() })
  } catch {
    // No active session — nothing to invalidate.
  }

  // Browser HTML form submits (Accept: text/html) → 303 to /login.
  // fetch() callers with JSON Accept get the JSON body.
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    const origin = publicOrigin(req, new URL(req.url).origin)
    return NextResponse.redirect(new URL('/login', origin), { status: 303 })
  }
  return NextResponse.json({ ok: true })
}
