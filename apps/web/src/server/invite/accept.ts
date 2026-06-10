import { ConflictError, NotFoundError, ServiceError } from '@/server/error'
import type { Membership, PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  token: z.string().min(1),
  userId: z.string().uuid(),
})

export async function acceptInvite(
  raw: unknown,
  prisma: PrismaClient,
): Promise<{ membership: Membership; familyId: string }> {
  const input = Input.parse(raw)

  const invite = await prisma.invite.findUnique({ where: { token: input.token } })
  if (!invite) throw new NotFoundError('invite.notFound')
  if (invite.acceptedAt) throw new ConflictError('invite.alreadyAccepted')
  if (invite.revokedAt) throw new ConflictError('invite.revoked')
  if (invite.expiresAt.getTime() < Date.now()) throw new ServiceError(400, 'invite.expired')

  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new NotFoundError('invite.userNotFound')

  return prisma.$transaction(async (tx) => {
    const existing = await tx.membership.findUnique({
      where: { familyId_userId: { familyId: invite.familyId, userId: input.userId } },
    })
    if (existing && !existing.deletedAt) {
      throw new ConflictError('invite.alreadyMember')
    }

    // 업데이트 where 는 tenant 미들웨어(§8)가 허용하는 키로: Membership 은 familyId 를
    // 담은 compound(familyId_userId), Invite 는 token. by-id 업데이트는 familyId 필터가
    // 없어 dev(throw) 에서 막힌다.
    const membership = existing
      ? await tx.membership.update({
          where: { familyId_userId: { familyId: invite.familyId, userId: input.userId } },
          // 정지 이력을 초기화하고 부활시킨다 — 안 그러면 '정지→제거→재초대' 멤버가
          // 합류 즉시 전면 정지 상태(suspendedAt 잔존)가 돼 로그인이 막힌다.
          data: {
            role: invite.role,
            deletedAt: null,
            suspendedAt: null,
            suspendedReason: null,
            suspendedByUserId: null,
          },
        })
      : await tx.membership.create({
          data: {
            familyId: invite.familyId,
            userId: input.userId,
            role: invite.role,
          },
        })

    await tx.invite.update({
      where: { token: invite.token },
      data: { acceptedAt: new Date(), acceptedById: input.userId },
    })

    return { membership, familyId: invite.familyId }
  })
}
