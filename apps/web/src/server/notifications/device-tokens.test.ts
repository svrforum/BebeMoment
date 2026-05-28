import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { deleteDeviceToken, listDeviceTokensForUsers, registerDeviceToken } from './device-tokens'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.devicePushToken.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function makeUser(email: string) {
  const { user } = await signup(
    { email, password: 'password123', displayName: email },
    db.prismaPublic,
  )
  return user
}

describe('registerDeviceToken', () => {
  it('creates a row', async () => {
    const u = await makeUser('a@b.com')
    await registerDeviceToken(
      { userId: u.id, token: 'tok-1', platform: 'android' },
      db.prismaPublic,
    )
    const rows = await listDeviceTokensForUsers([u.id], db.prismaPublic)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.token).toBe('tok-1')
    expect(rows[0]?.userId).toBe(u.id)
  })

  it('upserts idempotently by token (stays one row, updates user)', async () => {
    const u1 = await makeUser('a@b.com')
    const u2 = await makeUser('c@d.com')
    await registerDeviceToken(
      { userId: u1.id, token: 'tok-same', platform: 'android' },
      db.prismaPublic,
    )
    await registerDeviceToken(
      { userId: u2.id, token: 'tok-same', platform: 'android' },
      db.prismaPublic,
    )
    const all = await db.prismaPublic.devicePushToken.findMany()
    expect(all).toHaveLength(1)
    expect(all[0]?.userId).toBe(u2.id)
  })
})

describe('deleteDeviceToken', () => {
  it('deletes a token scoped to user', async () => {
    const u = await makeUser('a@b.com')
    await registerDeviceToken(
      { userId: u.id, token: 'tok-2', platform: 'android' },
      db.prismaPublic,
    )
    await deleteDeviceToken({ userId: u.id, token: 'tok-2' }, db.prismaPublic)
    expect(await listDeviceTokensForUsers([u.id], db.prismaPublic)).toHaveLength(0)
  })

  it('does not delete another user’s token', async () => {
    const u1 = await makeUser('a@b.com')
    const u2 = await makeUser('c@d.com')
    await registerDeviceToken(
      { userId: u1.id, token: 'tok-3', platform: 'android' },
      db.prismaPublic,
    )
    await deleteDeviceToken({ userId: u2.id, token: 'tok-3' }, db.prismaPublic)
    expect(await listDeviceTokensForUsers([u1.id], db.prismaPublic)).toHaveLength(1)
  })
})

describe('listDeviceTokensForUsers', () => {
  it('returns empty for no users', async () => {
    expect(await listDeviceTokensForUsers([], db.prismaPublic)).toEqual([])
  })
})
