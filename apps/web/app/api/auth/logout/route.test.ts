import { signup } from '@/server/auth/signup'
import { issueWidgetToken } from '@/server/widget/token'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: null as unknown as FullTestDb,
  userId: null as string | null,
  signOutCalls: 0,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => true }),
  getLocale: async () => 'ko',
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () =>
    state.userId
      ? {
          user: {
            id: state.userId,
            email: null,
            emailVerified: false,
            displayName: 'U',
            locale: 'ko',
          },
          session: { id: 'sess', userId: state.userId, currentFamilyId: null },
        }
      : { user: null, session: null },
}))
vi.mock('@/lib/auth-config', () => ({
  auth: {
    api: {
      signOut: async () => {
        state.signOutCalls += 1
        return { success: true }
      },
    },
  },
}))
vi.mock('@/lib/db-init', () => ({
  get prismaPublic() {
    return state.db.prismaPublic
  },
  get prismaMedia() {
    return state.db.prismaMedia
  },
}))

beforeAll(async () => {
  state.db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await state.db.stop()
})
beforeEach(async () => {
  await state.db.prismaPublic.widgetToken.deleteMany()
  await state.db.prismaPublic.membership.deleteMany()
  await state.db.prismaPublic.family.deleteMany()
  await state.db.prismaPublic.user.deleteMany()
  state.userId = null
  state.signOutCalls = 0
})

async function widgetData(token: string): Promise<Response> {
  const { GET } = await import('../../widget/data/route')
  return GET(
    new Request('http://localhost/api/widget/data', {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
}

describe('POST /api/auth/logout', () => {
  // 세션만 지우면 위젯 bearer 토큰은 살아 있어, 로그아웃한 기기의 홈 위젯이 계속 사진을 받았다.
  it('revokes the widget token so the old bearer is rejected afterwards', async () => {
    const { user } = await signup(
      { username: 'user1', password: 'password123', displayName: 'U' },
      state.db.prismaPublic,
    )
    const token = await issueWidgetToken(user.id, state.db.prismaPublic)
    state.userId = user.id

    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { accept: 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect(state.signOutCalls).toBe(1)

    const after = await widgetData(token)
    expect(after.status).toBe(401)
    expect(await state.db.prismaPublic.widgetToken.count({ where: { userId: user.id } })).toBe(0)
  })

  it("still answers 200 without a session and touches nobody else's token", async () => {
    const { user } = await signup(
      { username: 'user2', password: 'password123', displayName: 'U' },
      state.db.prismaPublic,
    )
    const token = await issueWidgetToken(user.id, state.db.prismaPublic)
    const { POST } = await import('./route')
    const res = await POST(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { accept: 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await state.db.prismaPublic.widgetToken.findUnique({ where: { token } })).not.toBeNull()
  })
})
