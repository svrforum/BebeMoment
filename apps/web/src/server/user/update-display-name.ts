import { ServiceError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'

export async function updateDisplayName(
  userId: string,
  displayName: string,
  prisma: PrismaClient,
): Promise<{ displayName: string }> {
  const name = displayName.trim()
  if (name.length < 1) throw new ServiceError(400, 'user.displayNameRequired')
  if (name.length > 60) throw new ServiceError(400, 'user.displayNameTooLong')
  const user = await prisma.user.update({
    where: { id: userId },
    data: { displayName: name },
    select: { displayName: true },
  })
  return { displayName: user.displayName }
}
