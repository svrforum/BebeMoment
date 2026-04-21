import type { Membership, PrismaClient } from '@bebe/db'
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
  if (!invite) throw new Error('Invite not found')
  if (invite.acceptedAt) throw new Error('Invite already accepted')
  if (invite.revokedAt) throw new Error('Invite was revoked')
  if (invite.expiresAt.getTime() < Date.now()) throw new Error('Invite has expired')

  const user = await prisma.user.findUnique({ where: { id: input.userId } })
  if (!user) throw new Error('User not found')
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error('Invite email does not match your account email')
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.membership.findUnique({
      where: { familyId_userId: { familyId: invite.familyId, userId: input.userId } },
    })
    if (existing && !existing.deletedAt) {
      throw new Error('Already a member of this family')
    }

    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { role: invite.role, deletedAt: null },
        })
      : await tx.membership.create({
          data: {
            familyId: invite.familyId,
            userId: input.userId,
            role: invite.role,
          },
        })

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedById: input.userId },
    })

    return { membership, familyId: invite.familyId }
  })
}
