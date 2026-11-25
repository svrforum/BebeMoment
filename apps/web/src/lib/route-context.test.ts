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
const state = vi.hoisted(() => ({
  session: null as { userId: string; currentFamilyId: string | null } | null,
  ctx: null as Ctx | null,
  resolveCalls: 0,
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () => ({ user: null, session: state.session }),
}))
vi.mock('@/server/context', () => ({
  resolveContext: async () => {
    state.resolveCalls += 1
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
  state.resolveCalls = 0
})

describe('requireRouteContext', () => {
  it('세션이 없으면 401 unauthorized — 가족은 찾지 않는다', async () => {
    state.session = null
    const res = await requireRouteContext()
    if (!(res instanceof NextResponse)) throw new Error('응답이어야 한다')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(state.resolveCalls).toBe(0)
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
  })
})
