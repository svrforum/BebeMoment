import { getAuth } from '@/lib/auth'
import { prismaPublic as defaultPrisma } from '@/lib/db-init'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { type Capability, capabilitiesForRole } from '@bebe/core'
import type { Family, Membership, PrismaClient, User } from '@bebe/db-public'
import { cache } from 'react'

export type SessionRef = {
  userId: string | null
  currentFamilyId: string | null
}

export type Context = {
  user: User | null
  family: Family | null
  membership: Membership | null
  capabilities: Capability[]
}

/**
 * Request-scoped context. Deduped across layout + page in one request via React cache().
 * Use this in RSC pages/layouts. API routes still use resolveContext(session, prisma) directly.
 */
export const getContext = cache(async (): Promise<Context> => {
  const { session } = await getAuth()
  if (!session) return { user: null, family: null, membership: null, capabilities: [] }
  return resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    defaultPrisma,
  )
})

export async function resolveContext(session: SessionRef, prisma: PrismaClient): Promise<Context> {
  if (!session.userId) return { user: null, family: null, membership: null, capabilities: [] }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return { user: null, family: null, membership: null, capabilities: [] }

  if (!session.currentFamilyId) {
    return { user, family: null, membership: null, capabilities: [] }
  }

  const membership = await prisma.membership.findUnique({
    where: {
      familyId_userId: { familyId: session.currentFamilyId, userId: user.id },
    },
    include: { family: true },
  })

  if (!membership || membership.deletedAt || membership.family.deletedAt) {
    return { user, family: null, membership: null, capabilities: [] }
  }

  const familyCaps = await getFamilyCapabilities(prisma)
  const capabilities = capabilitiesForRole(membership.role, familyCaps)

  return { user, family: membership.family, membership, capabilities }
}
