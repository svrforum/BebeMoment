import type { PrismaClient } from '@bebe/db-public'

export async function saveSubscription(
  input: {
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent?: string | null
  },
  prisma: PrismaClient,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
    update: {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
  })
}

export async function deleteSubscription(
  input: { userId: string; endpoint: string },
  prisma: PrismaClient,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: input.endpoint, userId: input.userId },
  })
}
