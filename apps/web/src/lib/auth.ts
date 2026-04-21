import { prisma } from '@bebe/db'
import { PrismaAdapter } from '@lucia-auth/adapter-prisma'
import { Lucia, TimeSpan } from 'lucia'
import { cookies } from 'next/headers'
import { cache } from 'react'

const adapter = new PrismaAdapter(prisma.session, prisma.user)

export const lucia = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(30, 'd'),
  sessionCookie: {
    name: 'bebe_session',
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  },
  getUserAttributes: (attrs) => ({
    email: attrs.email,
    displayName: attrs.display_name,
    locale: attrs.locale,
  }),
  getSessionAttributes: (attrs) => ({
    currentFamilyId: attrs.currentFamilyId,
  }),
})

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: {
      email: string | null
      display_name: string
      locale: string
    }
    DatabaseSessionAttributes: {
      currentFamilyId: string | null
    }
  }
}

export const getAuth = cache(async () => {
  const sessionId = (await cookies()).get(lucia.sessionCookieName)?.value ?? null
  if (!sessionId) return { user: null, session: null }
  const result = await lucia.validateSession(sessionId)
  try {
    if (result.session?.fresh) {
      const c = lucia.createSessionCookie(result.session.id)
      ;(await cookies()).set(c.name, c.value, c.attributes)
    }
    if (!result.session) {
      const c = lucia.createBlankSessionCookie()
      ;(await cookies()).set(c.name, c.value, c.attributes)
    }
  } catch {
    // RSC context cannot set cookies — ignore
  }
  return result
})
