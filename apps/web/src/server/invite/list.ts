import type { Invite, PrismaClient } from '@bebe/db-public'

export async function listInvites(
  args: { familyId: string; includeExpiredAccepted?: boolean },
  prisma: PrismaClient,
): Promise<Invite[]> {
  return prisma.invite.findMany({
    where: args.includeExpiredAccepted
      ? { familyId: args.familyId }
      : {
          familyId: args.familyId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
    orderBy: { createdAt: 'desc' },
  })
}
