import { verifyPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db'
import { z } from 'zod'

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function login(raw: unknown, prisma: PrismaClient): Promise<{ user: User }> {
  const input = LoginInput.parse(raw)

  const user = await prisma.user.findUnique({ where: { email: input.email } })
  // Timing-attack mitigation: always run bcrypt even when user missing
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin'
  const ok = await verifyPassword(input.password, hash)

  if (!user || !user.passwordHash || !ok) {
    throw new Error('Invalid credentials')
  }
  return { user }
}
