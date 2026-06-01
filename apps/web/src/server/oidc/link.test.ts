import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { linkIdentityToUser, listUserIdentities, unlinkIdentity } from './link'
import { createProvider } from './providers'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.oidcIdentity.deleteMany()
  await db.prismaPublic.oidcProvider.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

const SECRET = 'x'.repeat(64)
let seq = 0
async function makeUser() {
  const { user } = await signup(
    { username: `u${Date.now()}${seq++}`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  return user
}
async function makeProvider() {
  return createProvider(
    {
      name: '카카오',
      issuer: 'https://kauth.kakao.com',
      clientId: 'c',
      clientSecret: 's',
      scopes: [],
    },
    SECRET,
    db.prismaPublic,
  )
}

describe('account linking', () => {
  it('links an identity to a user and lists it', async () => {
    const user = await makeUser()
    const prov = await makeProvider()
    const r = await linkIdentityToUser(
      { userId: user.id, providerId: prov.id, subject: 'kakao-1', email: 'a@b.com' },
      db.prismaPublic,
    )
    expect(r).toEqual({ linked: true, conflict: false })
    const list = await listUserIdentities(user.id, db.prismaPublic)
    expect(list).toHaveLength(1)
    expect(list[0]?.providerName).toBe('카카오')
  })

  it('idempotent when already linked to the same user', async () => {
    const user = await makeUser()
    const prov = await makeProvider()
    await linkIdentityToUser(
      { userId: user.id, providerId: prov.id, subject: 's' },
      db.prismaPublic,
    )
    const r = await linkIdentityToUser(
      { userId: user.id, providerId: prov.id, subject: 's' },
      db.prismaPublic,
    )
    expect(r).toEqual({ linked: true, conflict: false })
    expect(await listUserIdentities(user.id, db.prismaPublic)).toHaveLength(1)
  })

  it('conflict when the SNS account is linked to another user', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const prov = await makeProvider()
    await linkIdentityToUser(
      { userId: a.id, providerId: prov.id, subject: 'shared' },
      db.prismaPublic,
    )
    const r = await linkIdentityToUser(
      { userId: b.id, providerId: prov.id, subject: 'shared' },
      db.prismaPublic,
    )
    expect(r).toEqual({ linked: false, conflict: true })
    expect(await listUserIdentities(b.id, db.prismaPublic)).toHaveLength(0)
  })

  it('unlinks', async () => {
    const user = await makeUser()
    const prov = await makeProvider()
    await linkIdentityToUser(
      { userId: user.id, providerId: prov.id, subject: 's' },
      db.prismaPublic,
    )
    await unlinkIdentity(user.id, prov.id, db.prismaPublic)
    expect(await listUserIdentities(user.id, db.prismaPublic)).toHaveLength(0)
  })

  it('OIDC-only 사용자의 마지막 신원 해제를 거부한다(잠금 방지)', async () => {
    const user = await makeUser()
    // OIDC 전용으로 만든다 — 비밀번호 credential 제거
    await db.prismaPublic.account.deleteMany({
      where: { userId: user.id, providerId: 'credential' },
    })
    const prov = await makeProvider()
    await linkIdentityToUser(
      { userId: user.id, providerId: prov.id, subject: 's' },
      db.prismaPublic,
    )

    await expect(unlinkIdentity(user.id, prov.id, db.prismaPublic)).rejects.toThrow(/마지막/)
    expect(await listUserIdentities(user.id, db.prismaPublic)).toHaveLength(1)
  })

  it('다른 OIDC 가 남으면 OIDC-only 사용자도 해제할 수 있다', async () => {
    const user = await makeUser()
    await db.prismaPublic.account.deleteMany({
      where: { userId: user.id, providerId: 'credential' },
    })
    const provA = await makeProvider()
    const provB = await makeProvider()
    await linkIdentityToUser(
      { userId: user.id, providerId: provA.id, subject: 'a' },
      db.prismaPublic,
    )
    await linkIdentityToUser(
      { userId: user.id, providerId: provB.id, subject: 'b' },
      db.prismaPublic,
    )

    await unlinkIdentity(user.id, provA.id, db.prismaPublic)
    expect(await listUserIdentities(user.id, db.prismaPublic)).toHaveLength(1)
  })
})
