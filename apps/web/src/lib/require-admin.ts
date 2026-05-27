import { hasAdminAccess } from '@/lib/admin-access'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
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
  const { user, session } = await getAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const ok = await hasAdminAccess(
    prismaPublic,
    user,
    session?.currentFamilyId ?? null,
    env.ADMIN_USER_EMAILS,
  )
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { user: { id: user.id, email: user.email, displayName: user.displayName }, env }
}
