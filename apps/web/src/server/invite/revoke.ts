import { can } from '@bebe/core'
import type { PrismaClient } from '@bebe/db'

export async function revokeInvite(
  args: { inviteId: string; familyId: string; byUserId: string },
  prisma: PrismaClient,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: args.familyId, userId: args.byUserId } },
  })
  if (!membership || !can(membership.role, 'member.invite')) {
    throw new Error('No permission to revoke invites')
  }
  await prisma.invite.update({
    where: { id: args.inviteId, familyId: args.familyId },
    data: { revokedAt: new Date() },
  })
}
