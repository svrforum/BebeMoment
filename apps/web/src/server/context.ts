import type { Family, Membership, PrismaClient, User } from '@bebe/db'

export type SessionRef = {
  userId: string | null
  currentFamilyId: string | null
}

export type Context = {
  user: User | null
  family: Family | null
  membership: Membership | null
}

export async function resolveContext(session: SessionRef, prisma: PrismaClient): Promise<Context> {
  if (!session.userId) return { user: null, family: null, membership: null }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return { user: null, family: null, membership: null }

  if (!session.currentFamilyId) {
    return { user, family: null, membership: null }
  }

  const membership = await prisma.membership.findUnique({
    where: {
      familyId_userId: { familyId: session.currentFamilyId, userId: user.id },
    },
    include: { family: true },
  })

  if (!membership || membership.deletedAt || membership.family.deletedAt) {
    return { user, family: null, membership: null }
  }

  return { user, family: membership.family, membership }
}
