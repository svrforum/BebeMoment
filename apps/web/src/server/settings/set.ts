import type { PrismaClient } from '@bebe/db'

export async function setSetting(
  key: string,
  value: unknown,
  updatedByUserId: string | null,
  prisma: PrismaClient,
): Promise<void> {
  const existing = await prisma.appSetting.findUnique({ where: { key } })
  const oldValue = existing?.value ?? null
  // biome-ignore lint/suspicious/noExplicitAny: Prisma Json type requires access
  const next = value as any
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key },
      create: { key, value: next, updatedById: updatedByUserId },
      update: { value: next, updatedById: updatedByUserId },
    }),
    prisma.settingHistory.create({
      data: {
        key,
        // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
        oldValue: oldValue as any,
        // biome-ignore lint/suspicious/noExplicitAny: Prisma Json
        newValue: next as any,
        changedBy: updatedByUserId,
      },
    }),
  ])
}
