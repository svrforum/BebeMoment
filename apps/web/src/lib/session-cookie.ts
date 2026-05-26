import type { PrismaClient } from '@bebe/db-public'

/**
 * After Better Auth creates a session (signInEmail / signUpEmail), stamp the
 * user's first family onto it. Better Auth sessions start with
 * currentFamilyId = null; the app's multi-tenancy reads session.currentFamilyId,
 * so we set it on the newest session row. Cookie cache is off, so the next
 * getSession reads this fresh from the DB.
 */
export async function setCurrentFamilyOnLatestSession(
  userId: string,
  prisma: PrismaClient,
): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { joinedAt: 'asc' },
  })
  if (!membership) return

  const latest = await prisma.session.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest) return

  await prisma.session.update({
    where: { id: latest.id },
    data: { currentFamilyId: membership.familyId },
  })
}
