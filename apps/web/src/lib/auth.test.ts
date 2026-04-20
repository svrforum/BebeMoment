import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  }
})

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
  }),
}))

describe('auth module', () => {
  it('exports lucia and getAuth', async () => {
    const mod = await import('./auth')
    expect(mod.lucia).toBeDefined()
    expect(mod.getAuth).toBeDefined()
  })
})
