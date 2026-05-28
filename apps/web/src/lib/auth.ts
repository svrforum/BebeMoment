import { auth } from '@/lib/auth-config'
import { headers } from 'next/headers'
import { cache } from 'react'

export { auth }

export type AuthUser = {
  id: string
  email: string | null
  emailVerified: boolean
  displayName: string
  locale: string
}

export type AuthSession = {
  id: string
  userId: string
  currentFamilyId: string | null
}

export type AuthResult = { user: AuthUser; session: AuthSession } | { user: null; session: null }

/**
 * Request-scoped session validation, deduped via React cache() across
 * layout + page in one render. Returns the same `{ user, session }` shape the
 * Lucia version exposed so resolveContext / getContext / route handlers keep
 * working unchanged: `session.userId` + `session.currentFamilyId`.
 */
export const getAuth = cache(async (): Promise<AuthResult> => {
  const result = await auth.api.getSession({ headers: await headers() })
  if (!result) return { user: null, session: null }

  const { user, session } = result
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      emailVerified: (user as { emailVerified?: boolean }).emailVerified ?? false,
      displayName: user.name,
      locale: (user as { locale?: string }).locale ?? 'ko',
    },
    session: {
      id: session.id,
      userId: session.userId,
      currentFamilyId: (session as { currentFamilyId?: string | null }).currentFamilyId ?? null,
    },
  }
})
