import { describe, expect, it } from 'vitest'
import {
  MILESTONE_PRESETS,
  getPreset,
  isValidPresetKey,
  presetKeysMatching,
} from './milestone-presets'

describe('milestone presets', () => {
  it('has 25 presets', () => {
    expect(MILESTONE_PRESETS.length).toBe(25)
  })

  it('all keys are unique', () => {
    const keys = MILESTONE_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('carries no prose — only key, category and age range', () => {
    for (const p of MILESTONE_PRESETS) {
      expect(Object.keys(p).sort()).toEqual(['category', 'key', 'typicalAgeMonths'])
      expect(p.key.length).toBeGreaterThan(0)
    }
  })

  it('typicalAgeMonths is [min, max] with min <= max', () => {
    for (const p of MILESTONE_PRESETS) {
      const [min, max] = p.typicalAgeMonths
      expect(min).toBeGreaterThanOrEqual(0)
      expect(max).toBeGreaterThanOrEqual(min)
      expect(max).toBeLessThanOrEqual(72)
    }
  })

  it('categories are constrained to the five allowed values', () => {
    const allowed = new Set(['motor', 'language', 'social', 'cognitive', 'life'])
    for (const p of MILESTONE_PRESETS) {
      expect(allowed.has(p.category)).toBe(true)
    }
  })

  it('isValidPresetKey recognises known keys and rejects unknown', () => {
    expect(isValidPresetKey('first_smile')).toBe(true)
    expect(isValidPresetKey('does_not_exist')).toBe(false)
  })

  it('getPreset returns the preset or undefined', () => {
    expect(getPreset('first_smile')?.category).toBe('social')
    expect(getPreset('nope')).toBeUndefined()
  })
})

describe('presetKeysMatching', () => {
  const labels = { first_smile: '첫 웃음', crawl: '기어다니기' }

  it('호출부가 넘긴(번역된) 라벨로 찾는다', () => {
    expect(presetKeysMatching('첫 웃음', labels)).toContain('first_smile')
  })

  it('부분 문자열도 찾는다', () => {
    expect(presetKeysMatching('웃음', labels)).toEqual(['first_smile'])
  })

  it('라벨이 없어도 키로는 찾는다', () => {
    expect(presetKeysMatching('first_smile')).toContain('first_smile')
  })

  it('영어 라벨을 넘기면 영어로 찾는다', () => {
    expect(presetKeysMatching('smile', { first_smile: 'First smile' })).toEqual(['first_smile'])
  })

  it('빈 검색어는 전부가 아니라 아무것도 아니다', () => {
    expect(presetKeysMatching('   ', labels)).toEqual([])
  })
})
