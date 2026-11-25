import { logger } from '@/lib/logger'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  deleted: [] as string[],
  complete: vi.fn(),
  createSession: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (h.jar.has(name) ? { name, value: h.jar.get(name) } : undefined),
    delete: (name: string) => {
      h.deleted.push(name)
    },
  }),
}))
vi.mock('next-intl/server', () => ({ getRequestConfig: (fn: unknown) => fn }))
vi.mock('@/lib/db-init', () => ({ prismaPublic: {}, prismaMedia: {} }))
vi.mock('@/lib/auth', () => ({ getAuth: async () => ({ user: null, session: null }) }))
vi.mock('@/lib/oidc-session', () => ({ createSessionAndSetCookie: h.createSession }))
vi.mock('@/server/oidc/complete-login', () => ({ completeOidcCallback: h.complete }))

const FLOW_COOKIES = [
  'oidc_state',
  'oidc_nonce',
  'oidc_invite',
  'oidc_link',
  'oidc_name',
  'oidc_app_challenge',
  'oidc_next',
]

beforeEach(() => {
  h.jar.clear()
  h.deleted.length = 0
  h.complete.mockReset()
  h.createSession.mockReset()
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@db.invalid:5432/test')
  vi.stubEnv('REDIS_URL', 'redis://test-fake')
  vi.stubEnv('SECRET_KEY', 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
  vi.stubEnv('PUBLIC_URL', 'https://app.example.com')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function callback(query = 'code=c1&state=s1'): Promise<Response> {
  const { GET } = await import('./route')
  return GET(
    new Request(`http://0.0.0.0:3000/api/auth/oidc/p1/callback?${query}`, {
      headers: { 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https' },
    }),
    { params: Promise.resolve({ providerId: 'p1' }) },
  )
}

describe('GET /api/auth/oidc/[providerId]/callback', () => {
  it('hands the query and every flow cookie to the login flow', async () => {
    for (const [name, value] of [
      ['oidc_state', 's1'],
      ['oidc_nonce', 'n1'],
      ['oidc_invite', 'inv'],
      ['oidc_link', '1'],
      ['oidc_name', 'Name'],
      ['oidc_app_challenge', 'ch'],
      ['oidc_next', '/story/3'],
    ] as const)
      h.jar.set(name, value)
    h.complete.mockResolvedValue({ kind: 'fail', error: 'state' })
    await callback()
    expect(h.complete).toHaveBeenCalledWith(
      {
        providerId: 'p1',
        code: 'c1',
        state: 's1',
        redirectUri: 'https://app.example.com/api/auth/oidc/p1/callback',
        cookies: {
          state: 's1',
          nonce: 'n1',
          invite: 'inv',
          link: '1',
          name: 'Name',
          appChallenge: 'ch',
          next: '/story/3',
        },
      },
      expect.objectContaining({ secretKey: expect.any(String) }),
    )
  })

  it('sends a refusal back to the login screen on the public origin and clears the flow cookies', async () => {
    h.complete.mockResolvedValue({ kind: 'fail', error: 'invite_required' })
    const res = await callback()
    expect(res.headers.get('location')).toBe('https://app.example.com/login?error=invite_required')
    expect([...h.deleted].sort()).toEqual([...FLOW_COOKIES].sort())
    expect(h.createSession).not.toHaveBeenCalled()
  })

  it('follows a plain redirect outcome', async () => {
    h.complete.mockResolvedValue({ kind: 'redirect', to: '/settings?linked=1' })
    const res = await callback()
    expect(res.headers.get('location')).toBe('https://app.example.com/settings?linked=1')
    expect(h.deleted).toHaveLength(FLOW_COOKIES.length)
  })

  it('signs in and returns to the saved path', async () => {
    h.complete.mockResolvedValue({
      kind: 'session',
      userId: 'u1',
      currentFamilyId: 'f1',
      to: '/story/20',
    })
    const res = await callback()
    expect(h.createSession).toHaveBeenCalledWith('u1', 'f1')
    expect(res.headers.get('location')).toBe('https://app.example.com/story/20')
    expect(h.deleted).toHaveLength(FLOW_COOKIES.length)
  })

  it('falls back to the login screen when the session cannot be written', async () => {
    h.complete.mockResolvedValue({ kind: 'session', userId: 'u1', currentFamilyId: null, to: '/' })
    h.createSession.mockRejectedValue(new Error('db down'))
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const res = await callback()
    expect(res.headers.get('location')).toBe('https://app.example.com/login?error=oidc_exchange')
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), providerId: 'p1' }),
      expect.any(String),
    )
  })

  it('answers an app hand-off with the page that opens the app, without a web session', async () => {
    h.complete.mockResolvedValue({ kind: 'handoff', code: 'abc' })
    const res = await callback()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toContain('intent://auth?code=abc#Intent')
    expect(h.createSession).not.toHaveBeenCalled()
    expect(h.deleted).toHaveLength(FLOW_COOKIES.length)
  })
})
