import { randomBytes } from 'node:crypto'
import { ForbiddenError, NotFoundError, ServiceError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'

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
  const membership = await prisma.membership.findFirst({
    where: { id: input.membershipId, familyId: input.familyId, deletedAt: null },
  })
  if (!membership) throw new NotFoundError('멤버를 찾을 수 없어요')
  if (membership.userId === input.actorUserId)
    throw new ForbiddenError('본인에게는 사용할 수 없는 기능이에요')

  const account = await prisma.account.findFirst({
    where: { userId: membership.userId, providerId: 'credential' },
  })
  if (!account)
    throw new ServiceError(400, 'OIDC 로 가입한 멤버는 OIDC 제공자에서 비밀번호를 변경해주세요')

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
