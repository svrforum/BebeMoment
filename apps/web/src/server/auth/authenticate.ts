import { verifyPassword } from '@/lib/password'
import { ServiceError } from '@/server/error'
import type { PrismaClient, User } from '@bebe/db-public'
import { isUserFullySuspended } from './suspension'
import { normalizeUsername } from './username'

export type AuthenticateInput = { identifier: string; password: string }

// 타이밍 공격 완화용 고정 더미 해시 — 사용자/계정 미존재시에도 bcrypt 한번 돌려
// 응답시간이 계정 존재 여부를 누설하지 않도록 한다. 어떤 평문에도 매치되지 않음.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8mZAEYG8nGD3l9hI3J5RJ1cP6sYqXa'

export async function authenticate(
  input: AuthenticateInput,
  prisma: PrismaClient,
): Promise<User | null> {
  const id = input.identifier.trim()
  const user = id.includes('@')
    ? await prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: normalizeUsername(id) } })

  if (!user) {
    await verifyPassword(input.password, DUMMY_HASH)
    return null
  }

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  })
  if (!account?.password) {
    await verifyPassword(input.password, DUMMY_HASH)
    return null
  }

  const ok = await verifyPassword(input.password, account.password)
  if (!ok) return null

  // 비번은 맞지만 가족 멤버십이 모두 정지된 계정은 차단한다(단일 가족 모델에선 보통 1개).
  if (await isUserFullySuspended(user.id, prisma)) {
    throw new ServiceError(403, '관리자에 의해 일시 정지된 계정이에요. 관리자에게 문의해주세요.')
  }

  return user
}
