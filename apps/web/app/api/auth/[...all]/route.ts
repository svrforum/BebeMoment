import { auth } from '@/lib/auth-config'
import { toNextJsHandler } from 'better-auth/next-js'

// Better Auth's own endpoints (sign-in, get-session, …). Next.js routes the
// explicit /api/auth/{login,logout,signup,oidc/*} files before this catch-all,
// so those custom routes keep their behavior.
export const { GET, POST } = toNextJsHandler(auth)
