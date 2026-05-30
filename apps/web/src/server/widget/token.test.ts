import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { issueWidgetToken } from './token'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.widgetToken.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function makeUser() {
  const { user } = await signup(
    {
      username: `u${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      password: 'password123',
      displayName: 'T',
    },
    db.prismaPublic,
  )
  return user
}

describe('issueWidgetToken', () => {
  it('토큰을 발급하고 32바이트 hex(64자) 이상', async () => {
    const user = await makeUser()
    const token = await issueWidgetToken(user.id, db.prismaPublic)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('같은 유저 재호출 → 같은 토큰(멱등)', async () => {
    const user = await makeUser()
    const a = await issueWidgetToken(user.id, db.prismaPublic)
    const b = await issueWidgetToken(user.id, db.prismaPublic)
    expect(b).toBe(a)
    expect(await db.prismaPublic.widgetToken.count()).toBe(1)
  })
})
