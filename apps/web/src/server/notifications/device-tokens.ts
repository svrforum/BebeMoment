import type { PrismaClient } from '@bebe/db-public'

export async function registerDeviceToken(
  input: { userId: string; token: string; platform: string },
  prisma: PrismaClient,
): Promise<void> {
  await prisma.devicePushToken.upsert({
    where: { token: input.token },
    create: { userId: input.userId, token: input.token, platform: input.platform },
    update: { userId: input.userId, platform: input.platform, lastSeenAt: new Date() },
  })
}

export async function deleteDeviceToken(
  input: { userId: string; token: string },
  prisma: PrismaClient,
): Promise<void> {
  await prisma.devicePushToken.deleteMany({
    where: { token: input.token, userId: input.userId },
  })
}

export async function listDeviceTokensForUsers(
  userIds: string[],
  prisma: PrismaClient,
): Promise<{ token: string; userId: string }[]> {
  if (userIds.length === 0) return []
  return prisma.devicePushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true, userId: true },
  })
}
