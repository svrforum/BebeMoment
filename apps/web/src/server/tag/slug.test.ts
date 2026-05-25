import { describe, expect, test } from 'vitest'
import { slugifyTag } from './slug'

describe('slugifyTag', () => {
  test('passes Korean through (no transliteration)', () => {
    expect(slugifyTag('여행')).toBe('여행')
    expect(slugifyTag('100일')).toBe('100일')
  })

  test('lowercases ASCII', () => {
    expect(slugifyTag('Travel')).toBe('travel')
    expect(slugifyTag('TRAVEL')).toBe('travel')
  })

  test('collapses whitespace into a single dash', () => {
    expect(slugifyTag('road trip')).toBe('road-trip')
    expect(slugifyTag('  spaced  out  ')).toBe('spaced-out')
    expect(slugifyTag('road\ttrip')).toBe('road-trip')
  })

  test('NFC-normalizes — visually-equal Korean strings collide', () => {
    // U+1100 (ᄀ) + U+1161 (ᅡ) decomposed vs U+AC00 (가) composed — same to a human.
    const decomposed = '가'
    const composed = '가' // '가'
    // They differ before normalization but collapse to the same NFC form.
    expect(decomposed).not.toBe(composed)
    expect(slugifyTag(decomposed)).toBe(slugifyTag(composed))
  })

  test('empty / whitespace-only input returns empty (caller validates)', () => {
    expect(slugifyTag('')).toBe('')
    expect(slugifyTag('   ')).toBe('')
  })
})
