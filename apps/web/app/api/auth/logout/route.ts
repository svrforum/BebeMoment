import { getAuth, lucia } from '@/lib/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (session) {
    await lucia.invalidateSession(session.id)
  }
  const c = lucia.createBlankSessionCookie()
  ;(await cookies()).set(c.name, c.value, c.attributes)

  // Browser HTML form submits (Accept: text/html) → 303 to /login.
  // fetch() callers with JSON Accept get the JSON body.
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
  }
  return NextResponse.json({ ok: true })
}
