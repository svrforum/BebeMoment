import { randomBytes } from 'node:crypto'
import { ForbiddenError, NotFoundError, ServiceError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'
import { assertActorIsOwner } from './assert-owner'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export type IssuePasswordResetInput = {
  membershipId: string
  familyId: string
  actorUserId: string
  publicUrl: string
}

export async function issuePasswordReset(
  input: IssuePasswordResetInput,
  prisma: PrismaClient,
): Promise<{ url: string; expiresAt: Date }> {
  await assertActorIsOwner(input.actorUserId, input.familyId, prisma)
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('member.notFound')
  if (membership.userId === input.actorUserId) throw new ForbiddenError('member.selfAction')

  const account = await prisma.account.findFirst({
    where: { userId: membership.userId, providerId: 'credential' },
  })
  if (!account) throw new ServiceError(400, 'member.oidcPassword')

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: membership.userId, usedAt: null },
      data: { usedAt: now },
    })
    await tx.passwordResetToken.create({
      data: { token, userId: membership.userId, issuedByUserId: input.actorUserId, expiresAt },
    })
  })

  const base = input.publicUrl.replace(/\/$/, '')
  return { url: `${base}/reset-password?token=${token}`, expiresAt }
}
