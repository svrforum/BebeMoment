import type { PrismaClient, Role } from '@bebe/db-public'

export type FamilyMember = {
  membershipId: string
  userId: string
  displayName: string
  username: string | null
  email: string | null
  avatarPath: string | null
  role: Role
  joinedAt: Date
  suspendedAt: Date | null
  removed: boolean
}

const ROLE_ORDER: Record<Role, number> = { owner: 0, guardian: 1, family: 2 }

export async function listFamilyMembers(
  familyId: string,
  prisma: PrismaClient,
): Promise<FamilyMember[]> {
  const rows = await prisma.membership.findMany({
    where: { familyId },
    include: {
      user: {
        select: { id: true, displayName: true, username: true, email: true, avatarPath: true },
      },
    },
  })
  return rows
    .map<FamilyMember>((r) => ({
      membershipId: r.id,
      userId: r.user.id,
      displayName: r.user.displayName,
      username: r.user.username,
      email: r.user.email,
      avatarPath: r.user.avatarPath,
      role: r.role,
      joinedAt: r.joinedAt,
      suspendedAt: r.suspendedAt,
      removed: r.deletedAt !== null,
    }))
    .sort((a, b) => {
      if (a.removed !== b.removed) return a.removed ? 1 : -1
      const d = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
      return d !== 0 ? d : a.joinedAt.getTime() - b.joinedAt.getTime()
    })
}
