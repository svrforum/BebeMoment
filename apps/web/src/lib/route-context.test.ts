import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => false }),
}))
vi.mock('@/lib/db-init', () => ({ prismaPublic: {} }))

type Ctx = {
  user: { id: string } | null
  family: { id: string } | null
  membership: { role: string } | null
  capabilities: string[]
}
type SessionRef = { userId: string; currentFamilyId: string | null }
const state = vi.hoisted(() => ({
  session: null as { userId: string; currentFamilyId?: string | null } | null,
  ctx: null as Ctx | null,
  resolveCalls: [] as SessionRef[],
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () => ({ user: null, session: state.session }),
}))
vi.mock('@/server/context', () => ({
  resolveContext: async (session: SessionRef) => {
    state.resolveCalls.push(session)
    return state.ctx
  },
}))

const { requireRouteContext } = await import('./route-context')

const READY: Ctx = {
  user: { id: 'u1' },
  family: { id: 'f1' },
  membership: { role: 'guardian' },
  capabilities: ['asset.upload'],
}

beforeEach(() => {
  state.session = { userId: 'u1', currentFamilyId: 'f1' }
  state.ctx = READY
  state.resolveCalls = []
})

describe('requireRouteContext', () => {
  it('세션이 없으면 401 unauthorized — 가족은 찾지 않는다', async () => {
    state.session = null
    const res = await requireRouteContext()
    if (!(res instanceof NextResponse)) throw new Error('응답이어야 한다')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(state.resolveCalls).toEqual([])
  })

  it('현재 가족이 없으면 400 noFamily', async () => {
    state.ctx = { user: { id: 'u1' }, family: null, membership: null, capabilities: [] }
    const res = await requireRouteContext()
    if (!(res instanceof NextResponse)) throw new Error('응답이어야 한다')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'noFamily' })
  })

  it('세션의 사용자가 사라졌어도 400 noFamily', async () => {
    state.ctx = { user: null, family: null, membership: null, capabilities: [] }
    const res = await requireRouteContext()
    if (!(res instanceof NextResponse)) throw new Error('응답이어야 한다')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'noFamily' })
  })

  it('가족이 정해지면 사용자·가족·멤버십·능력을 그대로 돌려준다', async () => {
    const res = await requireRouteContext()
    if (res instanceof NextResponse) throw new Error(`거절되면 안 된다: ${res.status}`)
    expect(res).toEqual(READY)
    expect(res.membership.role).toBe('guardian')
    expect(state.resolveCalls).toEqual([{ userId: 'u1', currentFamilyId: 'f1' }])
  })

  // 세션 행에 현재 가족이 아직 없으면 필드가 비어 온다 — resolveContext 는 null 만 '가족 없음' 으로 안다.
  it('세션의 현재 가족이 비어 있으면 null 로 넘긴다', async () => {
    state.session = { userId: 'u1' }
    state.ctx = { user: { id: 'u1' }, family: null, membership: null, capabilities: [] }
    const res = await requireRouteContext()
    if (!(res instanceof NextResponse)) throw new Error('응답이어야 한다')
    expect(res.status).toBe(400)
    expect(state.resolveCalls).toEqual([{ userId: 'u1', currentFamilyId: null }])
  })
})
