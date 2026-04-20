import { describe, expect, it } from 'vitest'
import { toSlug } from './slug'

describe('toSlug', () => {
  it('converts english to lowercase-hyphen', () => {
    expect(toSlug('Hello World')).toBe('hello-world')
  })
  it('handles korean input by appending random suffix', () => {
    const s = toSlug('김씨네 가족')
    expect(s).toMatch(/^[a-z0-9-]+$/)
    expect(s.length).toBeGreaterThan(3)
  })
  it('strips special chars', () => {
    expect(toSlug("Alice's Family!")).toBe('alices-family')
  })
  it('trims and collapses hyphens', () => {
    expect(toSlug('  multiple   spaces  ')).toBe('multiple-spaces')
  })
  it('falls back to random for empty result', () => {
    const s = toSlug('!!!')
    expect(s).toMatch(/^family-[a-z0-9]{6}$/)
  })
})
