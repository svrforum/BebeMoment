import { type NextRequest, NextResponse } from 'next/server'

// 서버 컴포넌트(특히 (app) 레이아웃)가 현재 경로를 알 수 있도록 요청 헤더에 x-pathname 을
// 심는다. 리다이렉트 없는 순수 패스스루 — 미로그인 상태에서 보호 페이지(예: 공유된
// /detail/52)에 들어오면 레이아웃이 이 경로를 ?next= 로 붙여 로그인 후 그 자리로 돌려보낸다.
export function middleware(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers)
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

// api·media(프록시)·정적 자산은 제외 — 보호 페이지(서버 컴포넌트)만 대상.
export const config = {
  matcher: ['/((?!api|media|_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
}
