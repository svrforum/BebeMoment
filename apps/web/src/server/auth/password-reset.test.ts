import { verifyPassword } from '@/lib/password'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetPasswordWithToken } from './password-reset'
import { signup } from './signup'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.passwordResetToken.deleteMany()
  await db.prismaPublic.account.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function seedToken(opts: { expiresAt?: Date; usedAt?: Date | null } = {}) {
  const { user } = await signup(
    { username: 'member', password: 'oldpassword', displayName: '할머니' },
    db.prismaPublic,
  )
  const t = await db.prismaPublic.passwordResetToken.create({
    data: {
      token: 'tok-1234',
      userId: user.id,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
      usedAt: opts.usedAt ?? null,
    },
  })
  return { user, token: t.token }
}

describe('resetPasswordWithToken', () => {
  it('유효 토큰으로 비번을 바꾸고 usedAt 을 설정한다', async () => {
    const { user, token } = await seedToken()
    await resetPasswordWithToken({ token, newPassword: 'brandnewpw' }, db.prismaPublic)
    const account = await db.prismaPublic.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    })
    expect(await verifyPassword('brandnewpw', account!.password!)).toBe(true)
    const refreshed = await db.prismaPublic.user.findUnique({ where: { id: user.id } })
    expect(await verifyPassword('brandnewpw', refreshed!.passwordHash!)).toBe(true)
    const used = await db.prismaPublic.passwordResetToken.findUnique({ where: { token } })
    expect(used?.usedAt).not.toBeNull()
  })
  it('만료된 토큰은 거부한다', async () => {
    const { token } = await seedToken({ expiresAt: new Date(Date.now() - 1000) })
    await expect(
      resetPasswordWithToken({ token, newPassword: 'brandnewpw' }, db.prismaPublic),
    ).rejects.toThrow('auth.resetLinkExpired')
  })
  it('이미 사용된 토큰은 거부한다', async () => {
    const { token } = await seedToken({ usedAt: new Date() })
    await expect(
      resetPasswordWithToken({ token, newPassword: 'brandnewpw' }, db.prismaPublic),
    ).rejects.toThrow('auth.resetLinkExpired')
  })
  it('존재하지 않는 토큰은 거부한다', async () => {
    await expect(
      resetPasswordWithToken({ token: 'nope', newPassword: 'brandnewpw' }, db.prismaPublic),
    ).rejects.toThrow('auth.resetLinkExpired')
  })
  it('8자 미만 비번은 거부한다', async () => {
    const { token } = await seedToken()
    await expect(
      resetPasswordWithToken({ token, newPassword: 'short' }, db.prismaPublic),
    ).rejects.toThrow('8자')
  })
})
