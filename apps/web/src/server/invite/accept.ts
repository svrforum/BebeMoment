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
    // 토큰을 먼저 선점한다 — 위의 읽기는 트랜잭션 밖이라 같은 토큰으로 동시에 들어온 두 가입이
    // 둘 다 통과했다(1회용이 아니었다). 조건부 갱신은 행 잠금 뒤 WHERE 를 다시 평가하므로
    // 늦은 쪽은 count 0 을 받고, 던지면 트랜잭션이 되돌아가 멤버십도 남지 않는다.
    const claimed = await tx.invite.updateMany({
      where: {
        token: invite.token,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date(), acceptedById: input.userId },
    })
    if (claimed.count !== 1) throw new ConflictError('invite.alreadyAccepted')

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

    return { membership, familyId: invite.familyId }
  })
}
