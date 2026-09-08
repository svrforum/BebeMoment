import { hasAdminAccess } from '@/lib/admin-access'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { parseEnv } from '@bebe/config'
import type { User } from '@bebe/db-public'
import type { NextResponse } from 'next/server'

export type AdminContext = {
  user: Pick<User, 'id' | 'email' | 'displayName'>
  env: ReturnType<typeof parseEnv>
}

/**
 * Returns admin context if authenticated admin, otherwise a 401/403 NextResponse
 * (errorJsonKey — 관리자 라우트 20개의 거절이 여기 한 곳을 지나므로 로그·번역도 여기서).
 * Usage:
 *   const ctx = await requireAdmin()
 *   if (ctx instanceof NextResponse) return ctx
 *   // use ctx.user / ctx.env
 */
export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  const { user, session } = await getAuth()
  if (!user) return errorJsonKey('unauthorized', 401)
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const ok = await hasAdminAccess(
    prismaPublic,
    user,
    session?.currentFamilyId ?? null,
    env.ADMIN_USER_EMAILS,
  )
  if (!ok) return errorJsonKey('forbidden', 403)
  return { user: { id: user.id, email: user.email, displayName: user.displayName }, env }
}
