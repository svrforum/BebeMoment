import type { PrismaClient } from '@bebe/db-public'

export async function updateDisplayName(
  userId: string,
  displayName: string,
  prisma: PrismaClient,
): Promise<{ displayName: string }> {
  const name = displayName.trim()
  if (name.length < 1) throw new Error('이름을 입력해주세요.')
  if (name.length > 60) throw new Error('이름은 60자 이하로 입력해주세요.')
  const user = await prisma.user.update({
    where: { id: userId },
    data: { displayName: name },
    select: { displayName: true },
  })
  return { displayName: user.displayName }
}
