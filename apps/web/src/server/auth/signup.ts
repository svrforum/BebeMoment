import { hashPassword } from '@/lib/password'
import type { PrismaClient, User } from '@bebe/db-public'
import { z } from 'zod'
import { isValidUsername, normalizeUsername } from './username'

const SignupInput = z
  .object({
    username: z.string().optional(),
    email: z.string().email('올바른 이메일을 입력해주세요').optional(),
    password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
    displayName: z.string().min(1, '이름을 입력해주세요').max(80),
  })
  .refine((v) => v.username || v.email, {
    message: '아이디 또는 이메일이 필요해요',
  })

export type SignupInput = z.infer<typeof SignupInput>
export type SignupResult = { user: User }

/**
 * 저수준 user 생성(시드/프로덕션 공용). user 행 + `credential` account(bcrypt 해시)를
 * Better Auth 와 동일한 형태로 쓴다. username 이 있으면 정규화·형식·중복 검증.
 */
export async function signup(raw: unknown, prisma: PrismaClient): Promise<SignupResult> {
  const input = SignupInput.parse(raw)
  const passwordHash = await hashPassword(input.password)

  let username: string | null = null
  if (input.username !== undefined) {
    username = normalizeUsername(input.username)
    if (!isValidUsername(username)) {
      throw new Error('아이디는 영문 소문자·숫자·._- 3~30자여야 해요')
    }
    if (await prisma.user.findUnique({ where: { username } })) {
      throw new Error('이미 사용 중인 아이디예요')
    }
  }

  if (input.email) {
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw new Error('이미 가입된 이메일이에요')
    }
  }

  const user = await prisma.user.create({
    data: {
      username,
      email: input.email ?? null,
      displayName: input.displayName,
      passwordHash,
      accounts: {
        create: { accountId: '', providerId: 'credential', password: passwordHash },
      },
    },
  })

  await prisma.account.updateMany({
    where: { userId: user.id, providerId: 'credential' },
    data: { accountId: user.id },
  })

  return { user }
}
