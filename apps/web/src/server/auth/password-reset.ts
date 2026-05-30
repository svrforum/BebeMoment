import { hashPassword } from '@/lib/password'
import { ServiceError } from '@/server/error'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'

const Input = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
})

export type ResetPasswordInput = z.infer<typeof Input>

export async function resetPasswordWithToken(
  raw: unknown,
  prisma: PrismaClient,
): Promise<{ ok: true }> {
  const input = Input.parse(raw)

  const record = await prisma.passwordResetToken.findUnique({ where: { token: input.token } })
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new ServiceError(400, '링크가 만료되었어요. 관리자에게 새 링크를 요청해주세요.')
  }

  const passwordHash = await hashPassword(input.newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
    await tx.account.updateMany({
      where: { userId: record.userId, providerId: 'credential' },
      data: { password: passwordHash },
    })
    await tx.passwordResetToken.update({
      where: { token: input.token },
      data: { usedAt: new Date() },
    })
    // 비밀번호 변경 시 기존 세션 전부 무효화 — 관리자가 (탈취 등으로) 재설정한 경우
    // 옛 세션이 살아있으면 안 된다. 사용자는 새 비번으로 다시 로그인.
    await tx.session.deleteMany({ where: { userId: record.userId } })
  })
  return { ok: true }
}
