import { hashPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db'
import { z } from 'zod'

const SignupInput = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
  displayName: z.string().min(1, '이름을 입력해주세요').max(80),
})

export type SignupInput = z.infer<typeof SignupInput>
export type SignupResult = { user: User }

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
    },
  })
  return { user }
}
