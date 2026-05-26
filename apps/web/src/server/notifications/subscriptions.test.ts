import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { deleteSubscription, saveSubscription } from './subscriptions'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.pushSubscription.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function makeUser(email: string) {
  const { user } = await signup(
    { email, password: 'password123', displayName: email },
    db.prismaPublic,
  )
  return user
}

describe('saveSubscription', () => {
  it('creates a subscription row', async () => {
    const user = await makeUser('a@b.com')
    await saveSubscription(
      {
        userId: user.id,
        endpoint: 'https://push.example.com/abc',
        p256dh: 'key-p256dh',
        auth: 'key-auth',
        userAgent: 'jest',
      },
      db.prismaPublic,
    )
    const rows = await db.prismaPublic.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.endpoint).toBe('https://push.example.com/abc')
    expect(rows[0]?.userId).toBe(user.id)
    expect(rows[0]?.userAgent).toBe('jest')
  })

  it('upserts on same endpoint (stays one row, updates keys + user)', async () => {
    const u1 = await makeUser('a@b.com')
    const u2 = await makeUser('c@d.com')
    await saveSubscription(
      {
        userId: u1.id,
        endpoint: 'https://push.example.com/same',
        p256dh: 'old-p256dh',
        auth: 'old-auth',
        userAgent: 'chrome',
      },
      db.prismaPublic,
    )
    await saveSubscription(
      {
        userId: u2.id,
        endpoint: 'https://push.example.com/same',
        p256dh: 'new-p256dh',
        auth: 'new-auth',
        userAgent: 'firefox',
      },
      db.prismaPublic,
    )
    const rows = await db.prismaPublic.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(u2.id)
    expect(rows[0]?.p256dh).toBe('new-p256dh')
    expect(rows[0]?.auth).toBe('new-auth')
    expect(rows[0]?.userAgent).toBe('firefox')
  })
})

describe('deleteSubscription', () => {
  it('removes the subscription for the owning user', async () => {
    const user = await makeUser('a@b.com')
    await saveSubscription(
      {
        userId: user.id,
        endpoint: 'https://push.example.com/del',
        p256dh: 'p',
        auth: 'a',
      },
      db.prismaPublic,
    )
    await deleteSubscription(
      { userId: user.id, endpoint: 'https://push.example.com/del' },
      db.prismaPublic,
    )
    const rows = await db.prismaPublic.pushSubscription.findMany()
    expect(rows).toHaveLength(0)
  })

  it('does not remove another user subscription', async () => {
    const owner = await makeUser('a@b.com')
    const other = await makeUser('c@d.com')
    await saveSubscription(
      {
        userId: owner.id,
        endpoint: 'https://push.example.com/owned',
        p256dh: 'p',
        auth: 'a',
      },
      db.prismaPublic,
    )
    await deleteSubscription(
      { userId: other.id, endpoint: 'https://push.example.com/owned' },
      db.prismaPublic,
    )
    const rows = await db.prismaPublic.pushSubscription.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(owner.id)
  })
})
