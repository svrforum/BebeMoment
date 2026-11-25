import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROVIDER_ID = '00000000-0000-4000-8000-000000000001'
const h = vi.hoisted(() => ({ set: new Map<string, string>() }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string) => {
      h.set.set(name, value)
    },
  }),
}))
// 네이버는 고정 authorize 주소라 discovery 없이 끝까지 간다.
vi.mock('@/lib/db-init', () => ({
  prismaPublic: {
    oidcProvider: {
      findUnique: async () => ({
        id: PROVIDER_ID,
        kind: 'naver',
        enabled: true,
        clientId: 'client-id',
        issuer: 'https://idp.example.com',
        scopes: [],
      }),
    },
  },
}))

beforeEach(() => {
  h.set.clear()
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@db.invalid:5432/test')
  vi.stubEnv('REDIS_URL', 'redis://test-fake')
  vi.stubEnv('SECRET_KEY', 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
  vi.stubEnv('PUBLIC_URL', 'https://app.example.com')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

async function start(query: string): Promise<Response> {
  const { GET } = await import('./route')
  return GET(new Request(`https://app.example.com/api/auth/oidc/${PROVIDER_ID}?${query}`), {
    params: Promise.resolve({ providerId: PROVIDER_ID }),
  })
}

describe('GET /api/auth/oidc/[providerId] — return path', () => {
  it('remembers a same-origin path to come back to after login', async () => {
    const res = await start('next=/story/3')
    expect(res.headers.get('location')).toMatch(/^https:\/\/nid\.naver\.com\//)
    expect(h.set.get('oidc_next')).toBe('/story/3')
  })

  it.each([
    ['protocol-relative', 'next=//evil.example'],
    ['tab-split', 'next=/%09/evil.example'],
    ['newline-split', 'next=/%0A/evil.example'],
  ])('does not remember a %s path that would leave the site', async (_label, query) => {
    await start(query)
    expect(h.set.has('oidc_state')).toBe(true)
    expect(h.set.has('oidc_next')).toBe(false)
  })
})
