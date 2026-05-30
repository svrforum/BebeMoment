import type { PrismaClient } from '@bebe/db-public'

export type LinkResult = { linked: boolean; conflict: boolean }

/**
 * 이미 로그인한 사용자에게 OIDC/SNS 신원을 연결한다. 같은 (provider, subject)가 다른
 * 사용자에 묶여 있으면 conflict(연결 거부). 이미 본인에게 묶여 있으면 멱등 성공.
 */
export async function linkIdentityToUser(
  args: { userId: string; providerId: string; subject: string; email?: string },
  prisma: PrismaClient,
): Promise<LinkResult> {
  const existing = await prisma.oidcIdentity.findUnique({
    where: { providerId_subject: { providerId: args.providerId, subject: args.subject } },
  })
  if (existing) {
    if (existing.userId === args.userId) return { linked: true, conflict: false }
    return { linked: false, conflict: true }
  }
  await prisma.oidcIdentity.create({
    data: {
      userId: args.userId,
      providerId: args.providerId,
      subject: args.subject,
      email: args.email ?? null,
    },
  })
  return { linked: true, conflict: false }
}

export type LinkedIdentity = { providerId: string; providerName: string; email: string | null }

export async function listUserIdentities(
  userId: string,
  prisma: PrismaClient,
): Promise<LinkedIdentity[]> {
  const rows = await prisma.oidcIdentity.findMany({
    where: { userId },
    include: { provider: { select: { id: true, name: true } } },
  })
  return rows.map((r) => ({
    providerId: r.providerId,
    providerName: r.provider.name,
    email: r.email,
  }))
}

export async function unlinkIdentity(
  userId: string,
  providerId: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.oidcIdentity.deleteMany({ where: { userId, providerId } })
}
