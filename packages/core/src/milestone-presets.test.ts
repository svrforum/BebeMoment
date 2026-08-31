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

  it('all labels are non-empty', () => {
    for (const p of MILESTONE_PRESETS) {
      expect(p.labelKo.length).toBeGreaterThan(0)
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
    expect(getPreset('first_smile')?.labelKo).toBe('첫 웃음')
    expect(getPreset('nope')).toBeUndefined()
  })
})

describe('presetKeysMatching', () => {
  it('사용자가 화면에서 보는 한국어 라벨로 찾는다', () => {
    expect(presetKeysMatching('첫 웃음')).toContain('first_smile')
  })

  it('부분 문자열도 찾는다', () => {
    expect(presetKeysMatching('웃음').length).toBeGreaterThan(0)
  })

  it('키로도 찾는다 — 라벨은 한국어뿐이다', () => {
    expect(presetKeysMatching('first_smile')).toContain('first_smile')
  })

  it('빈 검색어는 전부가 아니라 아무것도 아니다', () => {
    expect(presetKeysMatching('   ')).toEqual([])
  })
})
