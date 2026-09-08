import { errorJsonKey } from '@/lib/error-response'
import { isAllowedBetterAuthPath } from '@/lib/auth-blocked-paths'
import { auth } from '@/lib/auth-config'
import { toNextJsHandler } from 'better-auth/next-js'
import type { NextResponse } from 'next/server'

// Better Auth's own endpoints. Next.js routes the explicit
// /api/auth/{login,logout,signup,oidc/*} files before this catch-all, so those
// custom routes keep their behavior.
//
// Only get-session, sign-out and ok are reachable here (allowlist in
// auth-blocked-paths.ts). Credential auth runs EXCLUSIVELY through the custom
// /api/auth/{login,signup} routes (registration gate, suspension enforce,
// per-account rate limit); nothing in the browser or the app calls any other
// Better Auth endpoint over HTTP, so everything else is a 404.
const handler = toNextJsHandler(auth)

async function blockedResponse(req: Request): Promise<NextResponse | null> {
  if (!isAllowedBetterAuthPath(new URL(req.url).pathname)) {
    return await errorJsonKey('notFound', 404)
  }
  return null
}

export async function GET(req: Request): Promise<Response> {
  return (await blockedResponse(req)) ?? handler.GET(req)
}

export async function POST(req: Request): Promise<Response> {
  return (await blockedResponse(req)) ?? handler.POST(req)
}
