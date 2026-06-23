import { describe, expect, it } from 'vitest'
import { acquireSse, releaseSse } from './sse-limit'

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
})
