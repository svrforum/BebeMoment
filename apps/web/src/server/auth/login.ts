import { hashPassword, verifyPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db-public'
import { z } from 'zod'

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

let dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('dummy-never-matches')
  return dummyHashPromise
}

export async function login(raw: unknown, prisma: PrismaClient): Promise<{ user: User }> {
  const input = LoginInput.parse(raw)

  const user = await prisma.user.findUnique({ where: { email: input.email } })
  const hash = user?.passwordHash ?? (await getDummyHash())
  const ok = await verifyPassword(input.password, hash)

  if (!user || !user.passwordHash || !ok) {
    throw new Error('Invalid credentials')
  }
  return { user }
}
