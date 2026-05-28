import type { PrismaClient } from '@bebe/db-public'

/**
 * Resolve the user's "current" family id for a fresh login/signup. We pick the
 * oldest membership (joinedAt asc) — typically the only one for the single-family
 * model. Returns null when the user has no membership yet (pre-onboarding).
 *
 * Callers pass the result into `createSessionAndSetCookie(userId, currentFamilyId)`
 * which stamps it on the exact session row it creates by id. We deliberately
 * do NOT post-hoc query `session.findFirst({ orderBy: createdAt desc })` —
 * under concurrent logins that races and could stamp somebody else's session.
 */
export async function resolveCurrentFamilyForUser(
  userId: string,
  prisma: PrismaClient,
): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { joinedAt: 'asc' },
  })
  return membership?.familyId ?? null
}
