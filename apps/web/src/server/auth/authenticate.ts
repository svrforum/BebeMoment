import { verifyPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db-public'
import { normalizeUsername } from './username'

export type AuthenticateInput = { identifier: string; password: string }

export async function authenticate(
  input: AuthenticateInput,
  prisma: PrismaClient,
): Promise<User | null> {
  const id = input.identifier.trim()
  const user = id.includes('@')
    ? await prisma.user.findUnique({ where: { email: id } })
    : await prisma.user.findUnique({ where: { username: normalizeUsername(id) } })
  if (!user) return null

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  })
  if (!account?.password) return null

  const ok = await verifyPassword(input.password, account.password)
  return ok ? user : null
}
