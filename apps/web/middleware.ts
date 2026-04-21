import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest): NextResponse {
  const method = req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return NextResponse.next()
  }

  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) {
    // Server-to-server or curl — no Origin header set, allow.
    return NextResponse.next()
  }

  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      return new NextResponse('Invalid origin', { status: 403 })
    }
  } catch {
    return new NextResponse('Invalid origin', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Apply to all routes except static assets, Next internals, and OIDC callbacks
    // (GET-only in practice, but excluded defensively in case an IdP ever POSTs).
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|fonts/|sw.js|api/auth/oidc/).*)',
  ],
}
