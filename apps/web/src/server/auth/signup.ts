import { hashPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db'
import { z } from 'zod'

const SignupInput = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(80),
})

export type SignupInput = z.infer<typeof SignupInput>
export type SignupResult = { user: User }

export async function signup(raw: unknown, prisma: PrismaClient): Promise<SignupResult> {
  const input = SignupInput.parse(raw)
  const passwordHash = await hashPassword(input.password)

  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('Email already in use')

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    },
  })
  return { user }
}
