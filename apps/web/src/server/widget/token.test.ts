import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { issueWidgetToken, purgeStaleWidgetTokens, revokeWidgetTokens } from './token'

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

// 세션만 지우면 위젯 bearer 토큰은 영원히 살아 있었다 — 로그아웃·비번 재설정·정지 뒤에도 위젯이
// 계속 사진을 받았다.
describe('revokeWidgetTokens', () => {
  it('deletes the user token so the old bearer no longer resolves; a new issue mints a new one', async () => {
    const user = await makeUser()
    const other = await makeUser()
    const token = await issueWidgetToken(user.id, db.prismaPublic)
    const otherToken = await issueWidgetToken(other.id, db.prismaPublic)
    expect(await revokeWidgetTokens(user.id, db.prismaPublic)).toBe(1)
    expect(await db.prismaPublic.widgetToken.findUnique({ where: { token } })).toBeNull()
    expect(
      await db.prismaPublic.widgetToken.findUnique({ where: { token: otherToken } }),
    ).not.toBeNull()
    expect(await issueWidgetToken(user.id, db.prismaPublic)).not.toBe(token)
  })
})

describe('purgeStaleWidgetTokens', () => {
  const DAY = 24 * 60 * 60 * 1000
  it('drops tokens idle for 90 days (never-used ones by issue date) and keeps live ones', async () => {
    const now = new Date()
    const idle = await makeUser()
    const live = await makeUser()
    const neverUsedOld = await makeUser()
    const neverUsedNew = await makeUser()
    const idleToken = await issueWidgetToken(idle.id, db.prismaPublic)
    const liveToken = await issueWidgetToken(live.id, db.prismaPublic)
    const neverOldToken = await issueWidgetToken(neverUsedOld.id, db.prismaPublic)
    const neverNewToken = await issueWidgetToken(neverUsedNew.id, db.prismaPublic)
    await db.prismaPublic.widgetToken.update({
      where: { token: idleToken },
      data: { lastUsedAt: new Date(now.getTime() - 91 * DAY) },
    })
    await db.prismaPublic.widgetToken.update({
      where: { token: liveToken },
      data: { lastUsedAt: new Date(now.getTime() - 89 * DAY) },
    })
    await db.prismaPublic.widgetToken.update({
      where: { token: neverOldToken },
      data: { createdAt: new Date(now.getTime() - 91 * DAY) },
    })

    expect(await purgeStaleWidgetTokens(now, db.prismaPublic)).toBe(2)
    const left = (await db.prismaPublic.widgetToken.findMany()).map((t) => t.token).sort()
    expect(left).toEqual([liveToken, neverNewToken].sort())
  })
})
