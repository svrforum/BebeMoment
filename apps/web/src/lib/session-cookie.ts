import { lucia } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { cookies } from 'next/headers'

/**
 * Creates a new lucia session for the user (with first-family as current)
 * and writes the session cookie. Use after signup, login, or OIDC callback.
 */
export async function createSessionAndSetCookie(userId: string): Promise<void> {
  const membership = await prismaPublic.membership.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { joinedAt: 'asc' },
  })
  const session = await lucia.createSession(userId, {
    currentFamilyId: membership?.familyId ?? null,
  })
  const c = lucia.createSessionCookie(session.id)
  ;(await cookies()).set(c.name, c.value, c.attributes)
}
