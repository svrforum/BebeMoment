import { FEATURE_FLAGS, MILESTONE_PRESETS } from '@bebe/core'
import { describe, expect, it } from 'vitest'
import { formatAgeBucket, formatMemoryInterval, milestonePresetLabels } from './labels'
import { getServerTranslator } from './translator'

const age = { ko: getServerTranslator('ko', 'age'), en: getServerTranslator('en', 'age') }
const mem = {
  ko: getServerTranslator('ko', 'memories'),
  en: getServerTranslator('en', 'memories'),
}
const misc = { ko: getServerTranslator('ko', 'misc'), en: getServerTranslator('en', 'misc') }
const admin = { ko: getServerTranslator('ko', 'admin'), en: getServerTranslator('en', 'admin') }

describe('formatAgeBucket', () => {
  it('ko 는 기존 문구를 그대로 낸다 (core 에서 옮겨온 표기)', () => {
    expect(formatAgeBucket({ kind: 'days', n: 1 }, age.ko)).toBe('생후 1일')
    expect(formatAgeBucket({ kind: 'days', n: 47 }, age.ko)).toBe('생후 47일')
    expect(formatAgeBucket({ kind: 'hundredDays', n: 100 }, age.ko)).toBe('100일')
    expect(formatAgeBucket({ kind: 'months', n: 3 }, age.ko)).toBe('생후 3개월')
    expect(formatAgeBucket({ kind: 'monthsWithYears', n: 18, years: 1 }, age.ko)).toBe(
      '생후 18개월 · 만 1세',
    )
    expect(formatAgeBucket({ kind: 'monthsWithYears', n: 97, years: 8 }, age.ko)).toBe(
      '생후 97개월 · 만 8세',
    )
    expect(formatAgeBucket({ kind: 'anniversary', n: 1 }, age.ko)).toBe('1주년 (돌)')
    expect(formatAgeBucket({ kind: 'anniversary', n: 2 }, age.ko)).toBe('2주년')
    expect(formatAgeBucket({ kind: 'dday', n: 119 }, age.ko)).toBe('D-119')
  })

  it('en 은 한글 없이 낸다', () => {
    const all = [
      formatAgeBucket({ kind: 'dday', n: 1 }, age.en),
      formatAgeBucket({ kind: 'days', n: 47 }, age.en),
      formatAgeBucket({ kind: 'hundredDays', n: 100 }, age.en),
      formatAgeBucket({ kind: 'months', n: 3 }, age.en),
      formatAgeBucket({ kind: 'monthsWithYears', n: 18, years: 1 }, age.en),
      formatAgeBucket({ kind: 'anniversary', n: 2 }, age.en),
    ]
    for (const s of all) {
      expect(s.length).toBeGreaterThan(0)
      expect(s).not.toMatch(/[가-힯]/)
    }
    expect(formatAgeBucket({ kind: 'days', n: 47 }, age.en)).toBe('Day 47')
    expect(formatAgeBucket({ kind: 'months', n: 1 }, age.en)).toBe('1 month')
    expect(formatAgeBucket({ kind: 'months', n: 3 }, age.en)).toBe('3 months')
    expect(formatAgeBucket({ kind: 'anniversary', n: 2 }, age.en)).toBe('2nd birthday')
  })
})

describe('formatMemoryInterval', () => {
  it('ko', () => {
    expect(formatMemoryInterval({ kind: 'year', n: 1 }, mem.ko)).toBe('1년 전 오늘')
    expect(formatMemoryInterval({ kind: 'month', n: 6 }, mem.ko)).toBe('6개월 전 오늘')
  })
  it('en', () => {
    expect(formatMemoryInterval({ kind: 'year', n: 1 }, mem.en)).toBe('1 year ago today')
    expect(formatMemoryInterval({ kind: 'month', n: 6 }, mem.en)).toBe('6 months ago today')
  })
})

describe('milestonePresetLabels', () => {
  it('모든 프리셋에 ko·en 라벨이 있다', () => {
    for (const locale of ['ko', 'en'] as const) {
      const labels = milestonePresetLabels(misc[locale])
      expect(Object.keys(labels).length).toBe(MILESTONE_PRESETS.length)
      for (const p of MILESTONE_PRESETS) {
        expect(labels[p.key]).toBeTruthy()
        // 키를 못 찾으면 next-intl 은 키 경로를 그대로 돌려준다.
        expect(labels[p.key]).not.toContain('milestone.presets.')
      }
    }
  })

  it('en 라벨에는 한글이 없다', () => {
    const labels = milestonePresetLabels(misc.en)
    for (const v of Object.values(labels)) expect(v).not.toMatch(/[가-힯]/)
  })
})

// core 의 FEATURE_FLAG_LABELS 가 하던 검사 — 플래그를 추가하고 카탈로그를 잊으면 관리자
// 화면에 키 경로가 그대로 뜬다.
describe('기능 플래그 라벨', () => {
  it('모든 플래그에 ko·en label·description 이 있다', () => {
    for (const locale of ['ko', 'en'] as const) {
      for (const flag of FEATURE_FLAGS) {
        for (const field of ['label', 'description'] as const) {
          const key = `features.flags.${flag}.${field}`
          const value = admin[locale](key)
          expect(value).toBeTruthy()
          expect(value).not.toContain('features.flags.')
        }
      }
    }
  })
})
