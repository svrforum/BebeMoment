import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from './signup'
import { createAppHandoff, exchangeAppHandoff, hashVerifier } from './app-handoff'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appAuthHandoff.deleteMany()
  await db.prismaPublic.account.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function makeUser() {
  const { user } = await signup(
    { username: 'user1', password: 'password123', displayName: 'U' },
    db.prismaPublic,
  )
  return user
}

describe('app handoff', () => {
  it('mints and exchanges with the matching verifier', async () => {
    const user = await makeUser()
    const verifier = 'a'.repeat(40)
    const { code } = await createAppHandoff(
      { userId: user.id, currentFamilyId: null, challenge: hashVerifier(verifier) },
      db.prismaPublic,
    )
    const result = await exchangeAppHandoff({ code, verifier }, db.prismaPublic)
    expect(result.userId).toBe(user.id)
    // 단일 사용 — 두 번째 교환은 실패
    await expect(exchangeAppHandoff({ code, verifier }, db.prismaPublic)).rejects.toThrow(
      '유효하지',
    )
  })

  it('rejects a wrong verifier (deep-link interception)', async () => {
    const user = await makeUser()
    const { code } = await createAppHandoff(
      { userId: user.id, currentFamilyId: null, challenge: hashVerifier('right') },
      db.prismaPublic,
    )
    await expect(exchangeAppHandoff({ code, verifier: 'wrong' }, db.prismaPublic)).rejects.toThrow(
      '검증',
    )
  })

  it('rejects an expired code', async () => {
    const user = await makeUser()
    const verifier = 'v'.repeat(40)
    const { code } = await createAppHandoff(
      { userId: user.id, currentFamilyId: null, challenge: hashVerifier(verifier) },
      db.prismaPublic,
    )
    await db.prismaPublic.appAuthHandoff.update({
      where: { code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expect(exchangeAppHandoff({ code, verifier }, db.prismaPublic)).rejects.toThrow('만료')
  })

  it('rejects an unknown code', async () => {
    await expect(
      exchangeAppHandoff({ code: 'nope', verifier: 'x' }, db.prismaPublic),
    ).rejects.toThrow('유효하지')
  })
})
