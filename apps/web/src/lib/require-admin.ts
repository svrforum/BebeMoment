import { isInstanceAdmin } from '@/lib/admin'
import { getAuth } from '@/lib/auth'
import { parseEnv } from '@bebe/config'
import type { User } from '@bebe/db-public'
import { NextResponse } from 'next/server'

export type AdminContext = {
  user: Pick<User, 'id' | 'email' | 'displayName'>
  env: ReturnType<typeof parseEnv>
}

/**
 * Returns admin context if authenticated admin, otherwise a 403 NextResponse.
 * Usage:
 *   const ctx = await requireAdmin()
 *   if (ctx instanceof NextResponse) return ctx
 *   // use ctx.user / ctx.env
 */
export async function requireAdmin(): Promise<AdminContext | NextResponse> {
  const { user } = await getAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const env = parseEnv(process.env as Record<string, string | undefined>)
  if (!isInstanceAdmin(user.email, env.ADMIN_USER_EMAILS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user: { id: user.id, email: user.email, displayName: user.displayName }, env }
}
