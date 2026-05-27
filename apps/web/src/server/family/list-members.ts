import type { PrismaClient, Role } from '@bebe/db-public'

export type FamilyMember = {
  userId: string
  displayName: string
  username: string | null
  email: string | null
  avatarPath: string | null
  role: Role
  joinedAt: Date
}

const ROLE_ORDER: Record<Role, number> = { owner: 0, guardian: 1, family: 2 }

export async function listFamilyMembers(
  familyId: string,
  prisma: PrismaClient,
): Promise<FamilyMember[]> {
  const rows = await prisma.membership.findMany({
    where: { familyId, deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true,
          avatarPath: true,
        },
      },
    },
  })
  return rows
    .map<FamilyMember>((r) => ({
      userId: r.user.id,
      displayName: r.user.displayName,
      username: r.user.username,
      email: r.user.email,
      avatarPath: r.user.avatarPath,
      role: r.role,
      joinedAt: r.joinedAt,
    }))
    .sort((a, b) => {
      const d = ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
      return d !== 0 ? d : a.joinedAt.getTime() - b.joinedAt.getTime()
    })
}
