import { signup } from '@/server/auth/signup'
import { createFamily } from '@/server/family/create'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type AuthState = {
  user: { id: string; email: string | null; displayName: string } | null
  currentFamilyId: string | null
}
const state = vi.hoisted(() => ({
  db: null as unknown as FullTestDb,
  auth: { user: null, currentFamilyId: null } as AuthState,
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
    state.auth.user
      ? {
          user: { ...state.auth.user, emailVerified: false, locale: 'ko' },
          session: {
            id: 'sess',
            userId: state.auth.user.id,
            currentFamilyId: state.auth.currentFamilyId,
          },
        }
      : { user: null, session: null },
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
  process.env.DATABASE_URL = state.db.url
  process.env.REDIS_URL ??= 'redis://localhost:6379'
  process.env.SECRET_KEY ??= 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
  process.env.PUBLIC_URL ??= 'http://localhost:3000'
}, 120_000)
afterAll(async () => {
  await state.db.stop()
})
beforeEach(async () => {
  const p = state.db.prismaPublic
  await p.session.deleteMany()
  await p.membership.deleteMany()
  await p.family.deleteMany()
  await p.account.deleteMany()
  await p.user.deleteMany()
  state.auth = { user: null, currentFamilyId: null }
})

async function setup() {
  const { user: owner } = await signup(
    { username: 'owner', password: 'password123', displayName: 'Owner' },
    state.db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: owner.id }, state.db.prismaPublic)
  const { user: member } = await signup(
    { username: 'member', password: 'password123', displayName: 'Member' },
    state.db.prismaPublic,
  )
  const membership = await state.db.prismaPublic.membership.create({
    data: { familyId: family.id, userId: member.id, role: 'family' },
  })
  return { owner, family, member, membership }
}

function post(membershipId: string, body: unknown): Promise<Response> {
  return import('./route').then(({ POST }) =>
    POST(
      new Request(`http://localhost/api/admin/members/${membershipId}/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ membershipId }) },
    ),
  )
}

describe('POST /api/admin/members/[membershipId]/remove', () => {
  // 서버가 `confirm: z.literal('제외')` 를 요구해 en 로케일(확인 단어 "REMOVE")에서는 관리자가
  // 아무도 제외할 수 없었다. 확인 단어 대조는 모달이 하고 서버는 `confirm: true` 만 본다.
  it('removes the member with confirm:true regardless of locale word', async () => {
    const { owner, family, member, membership } = await setup()
    state.auth = { user: owner, currentFamilyId: family.id }
    const res = await post(membership.id, { confirm: true })
    expect(res.status).toBe(200)
    const row = await state.db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: member.id },
    })
    expect(row?.deletedAt).not.toBeNull()
  })

  it('rejects a body without confirm:true', async () => {
    const { owner, family, member, membership } = await setup()
    state.auth = { user: owner, currentFamilyId: family.id }
    for (const body of [{ confirm: 'REMOVE' }, { confirm: false }, {}]) {
      const res = await post(membership.id, body)
      expect(res.status).toBe(400)
    }
    const row = await state.db.prismaPublic.membership.findFirst({
      where: { familyId: family.id, userId: member.id },
    })
    expect(row?.deletedAt).toBeNull()
  })

  it('returns 403 for a non-admin member', async () => {
    const { family, member, membership } = await setup()
    state.auth = { user: member, currentFamilyId: family.id }
    const res = await post(membership.id, { confirm: true })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('returns 401 without a session', async () => {
    const { membership } = await setup()
    const res = await post(membership.id, { confirm: true })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })
})
