import type { PrismaClient } from '@bebe/db-public'

export async function isRegistrationOpen(prisma: PrismaClient): Promise<boolean> {
  return (await prisma.family.count()) === 0
}
