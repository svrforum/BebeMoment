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
  const referer = req.headers.get('referer')
  const host = req.headers.get('host')

  // 동일 출처 강제: Origin 이 있으면 그걸로, 없으면 Referer 로 폴백 검사한다. 둘 다
  // 없으면 네이티브 앱(세션 쿠키 기반 서버 호출)·서버투서버·curl 로 보고 통과시킨다.
  // 브라우저발 CSRF 는 상태변경 요청에 Origin(없으면 보통 Referer)을 항상 실어 보내고,
  // 추가로 세션 쿠키가 SameSite=lax 라 교차 사이트 쿠키 동반 POST 자체가 차단된다 —
  // 즉 SameSite 가 1차 방어선, 이 검사는 그 위의 방어층이다.
  const candidate = origin ?? referer
  if (host && candidate) {
    try {
      if (new URL(candidate).host !== host) {
        return new NextResponse('Invalid origin', { status: 403 })
      }
    } catch {
      return new NextResponse('Invalid origin', { status: 403 })
    }
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
