import type { PrismaClient } from '@bebe/db-public'

export async function isRegistrationOpen(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.family.count()) === 0
}

export async function validateInviteForSignup(
  token: string,
  email: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { token } })
  if (!invite) return false
  if (invite.acceptedAt || invite.revokedAt) return false
  if (invite.expiresAt.getTime() < Date.now()) return false
  return invite.email.toLowerCase() === email.toLowerCase()
}
