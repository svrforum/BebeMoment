import { isInstanceAdminUser } from '@/lib/admin'
import type { PrismaClient } from '@bebe/db-public'

/**
 * Admin access in the single-family model: the env-configured instance admin
 * (ADMIN_USER_EMAIL) OR the family `owner`. With username-based auth the owner
 * may have no email, so owner must be allowed in directly — otherwise the
 * person who set up the instance can't reach instance settings.
 *
 * The instance-admin email match requires `emailVerified` (isInstanceAdminUser)
 * so an unverified email (e.g. OIDC-asserted) equal to ADMIN_USER_EMAIL cannot
 * escalate to instance admin.
 */
export async function hasAdminAccess(
  prisma: PrismaClient,
  user: { id: string; email: string | null; emailVerified: boolean },
  currentFamilyId: string | null,
  adminEmails: readonly string[],
): Promise<boolean> {
  if (isInstanceAdminUser({ email: user.email, emailVerified: user.emailVerified }, adminEmails))
    return true
  if (!currentFamilyId) return false
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, familyId: currentFamilyId, deletedAt: null },
    select: { role: true },
  })
  return membership?.role === 'owner'
}
