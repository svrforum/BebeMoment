import { type NextRequest, NextResponse } from 'next/server'

// 패스스루 + 요청 헤더에 x-pathname 추가. (app) 레이아웃이 미로그인 시 이 경로를
// ?next= 로 붙여 로그인 후 원래 페이지(공유된 /detail/52 등)로 복귀시킨다.
function pass(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers)
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export function proxy(req: NextRequest): NextResponse {
  const method = req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return pass(req)
  }

  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) {
    // Server-to-server or curl — no Origin header set, allow.
    return pass(req)
  }

  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      return new NextResponse('Invalid origin', { status: 403 })
    }
  } catch {
    return new NextResponse('Invalid origin', { status: 403 })
  }

  return pass(req)
}

export const config = {
  matcher: [
    // Apply to all routes except static assets, Next internals, and OIDC callbacks
    // (GET-only in practice, but excluded defensively in case an IdP ever POSTs).
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|fonts/|sw.js|api/auth/oidc/).*)',
  ],
}
