import { describe, expect, it } from 'vitest'
import { parseMentions } from './parse-mentions'

const members = [
  { id: 'u1', displayName: '엄마' },
  { id: 'u2', displayName: '아빠' },
  { id: 'u3', displayName: '이모' },
]

describe('parseMentions', () => {
  it('returns empty array when no mention', () => {
    expect(parseMentions('안녕하세요', members)).toEqual([])
  })

  it('parses exact mention', () => {
    expect(parseMentions('@엄마 오늘 이거 봐요', members)).toEqual(['u1'])
  })

  it('parses multiple mentions', () => {
    expect(parseMentions('@엄마 와 @아빠 둘다', members)).toEqual(['u1', 'u2'])
  })

  it('deduplicates repeated mentions', () => {
    expect(parseMentions('@엄마 @엄마 @엄마', members)).toEqual(['u1'])
  })

  it('ignores mentions not matching any family member', () => {
    expect(parseMentions('@할머니 @엄마', members)).toEqual(['u1'])
  })

  it('ignores email-like occurrences', () => {
    expect(parseMentions('a@b.com', members)).toEqual([])
  })

  it('ignores mentions longer than 20 chars', () => {
    const long = `@${'x'.repeat(21)}`
    expect(parseMentions(`${long} 문장`, members)).toEqual([])
  })
})
