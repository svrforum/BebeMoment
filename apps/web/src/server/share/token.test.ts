import { describe, expect, it } from 'vitest'
import { expiryFromTtl, generateShareToken, isShareTtl } from './token'

describe('generateShareToken', () => {
  it('is url-safe and unguessably long', () => {
    const t = generateShareToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t.length).toBeGreaterThanOrEqual(20)
  })

  it('does not collide across many draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(generateShareToken())
    expect(seen.size).toBe(1000)
  })
})

describe('expiryFromTtl', () => {
  const now = new Date('2026-06-04T00:00:00.000Z')

  it('returns null for permanent', () => {
    expect(expiryFromTtl('permanent', now)).toBeNull()
  })

  it('adds the right number of days', () => {
    expect(expiryFromTtl('1d', now)?.toISOString()).toBe('2026-06-05T00:00:00.000Z')
    expect(expiryFromTtl('7d', now)?.toISOString()).toBe('2026-06-11T00:00:00.000Z')
    expect(expiryFromTtl('30d', now)?.toISOString()).toBe('2026-07-04T00:00:00.000Z')
  })
})

describe('isShareTtl', () => {
  it('accepts valid ttls and rejects junk', () => {
    expect(isShareTtl('permanent')).toBe(true)
    expect(isShareTtl('7d')).toBe(true)
    expect(isShareTtl('99d')).toBe(false)
    expect(isShareTtl(7)).toBe(false)
    expect(isShareTtl(undefined)).toBe(false)
  })
})
