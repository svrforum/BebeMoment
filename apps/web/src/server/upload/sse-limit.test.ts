import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireSse, releaseSse } from './sse-limit'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sse-limit', () => {
  it('allows up to the cap (5) then rejects, and frees a slot on release', () => {
    const u = `user-${Math.random()}`
    for (let i = 0; i < 5; i++) expect(acquireSse(u)).toBe(true)
    expect(acquireSse(u)).toBe(false) // 6th over the cap
    releaseSse(u)
    expect(acquireSse(u)).toBe(true) // freed slot reusable
    // cleanup
    for (let i = 0; i < 5; i++) releaseSse(u)
  })

  it('tracks users independently', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    for (let i = 0; i < 5; i++) acquireSse(a)
    expect(acquireSse(a)).toBe(false)
    expect(acquireSse(b)).toBe(true) // b unaffected by a's saturation
    for (let i = 0; i < 5; i++) releaseSse(a)
    releaseSse(b)
  })

  it('reads the cap from SSE_MAX_PER_USER', () => {
    vi.stubEnv('SSE_MAX_PER_USER', '2')
    const u = `user-${Math.random()}`
    expect(acquireSse(u)).toBe(true)
    expect(acquireSse(u)).toBe(true)
    expect(acquireSse(u)).toBe(false)
    releaseSse(u)
    releaseSse(u)
  })

  it('refuses a cap that is not a positive integer instead of lifting it', () => {
    // Number('many') 는 NaN 이고 `n >= NaN` 은 늘 false 라 예전엔 상한이 사라졌다.
    vi.stubEnv('SSE_MAX_PER_USER', 'many')
    expect(() => acquireSse(`user-${Math.random()}`)).toThrow(/SSE_MAX_PER_USER/)
  })
})
