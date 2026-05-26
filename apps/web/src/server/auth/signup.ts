import { hashPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db-public'
import { z } from 'zod'

const SignupInput = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
  displayName: z.string().min(1, '이름을 입력해주세요').max(80),
})

export type SignupInput = z.infer<typeof SignupInput>
export type SignupResult = { user: User }

/**
 * Low-level user creation used by tests/seeds. The production signup route goes
 * through Better Auth (auth.api.signUpEmail); this helper writes the same shape
 * directly — a user row plus a `credential` account holding the bcrypt hash —
 * so seeded users are indistinguishable from Better Auth-created ones.
 */
export async function signup(raw: unknown, prisma: PrismaClient): Promise<SignupResult> {
  const input = SignupInput.parse(raw)
  const passwordHash = await hashPassword(input.password)

  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('이미 가입된 이메일이에요')

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      accounts: {
        create: { accountId: '', providerId: 'credential', password: passwordHash },
      },
    },
  })

  // accountId mirrors Better Auth's convention (accountId = user.id) once the id
  // exists.
  await prisma.account.updateMany({
    where: { userId: user.id, providerId: 'credential' },
    data: { accountId: user.id },
  })

  return { user }
}
