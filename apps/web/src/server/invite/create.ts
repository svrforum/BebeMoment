import crypto from 'node:crypto'
import { ConflictError, ForbiddenError } from '@/server/error'
import { can } from '@bebe/core'
import type { Invite, PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

const Input = z.object({
  familyId: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.enum(['guardian', 'family']),
  byUserId: z.string().uuid(),
})

export async function createInvite(raw: unknown, prisma: PrismaClient): Promise<Invite> {
  const input = Input.parse(raw)

  const membership = await prisma.membership.findUnique({
    where: { familyId_userId: { familyId: input.familyId, userId: input.byUserId } },
  })
  if (!membership || membership.deletedAt || !can(membership.role, 'member.invite')) {
    throw new ForbiddenError('invite.noPermission')
  }

  if (input.email) {
    const existing = await prisma.invite.findFirst({
      where: {
        familyId: input.familyId,
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    })
    if (existing) {
      throw new ConflictError('invite.emailAlreadyInvited')
    }
  }

  const token = crypto.randomBytes(32).toString('base64url')
  return prisma.invite.create({
    data: {
      familyId: input.familyId,
      invitedById: input.byUserId,
      email: input.email ?? null,
      role: input.role,
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  })
}
