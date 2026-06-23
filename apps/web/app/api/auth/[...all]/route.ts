import { isBlockedBetterAuthPath } from '@/lib/auth-blocked-paths'
import { auth } from '@/lib/auth-config'
import { toNextJsHandler } from 'better-auth/next-js'
import { NextResponse } from 'next/server'

// Better Auth's own endpoints (get-session, sign-out, …). Next.js routes the
// explicit /api/auth/{login,logout,signup,oidc/*} files before this catch-all,
// so those custom routes keep their behavior.
//
// Credential auth runs EXCLUSIVELY through the custom /api/auth/{login,signup}
// routes (registration gate, suspension enforce, per-account rate limit). Better
// Auth's native /sign-up/email and /sign-in/email would otherwise stay reachable
// here and bypass all of that, so we 404 them before delegating.
const handler = toNextJsHandler(auth)

function blockedResponse(req: Request): NextResponse | null {
  if (isBlockedBetterAuthPath(new URL(req.url).pathname)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

export async function GET(req: Request): Promise<Response> {
  return blockedResponse(req) ?? handler.GET(req)
}

export async function POST(req: Request): Promise<Response> {
  return blockedResponse(req) ?? handler.POST(req)
}
