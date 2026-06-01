import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAGS,
  FEATURE_FLAG_LABELS,
  resolveFeatureFlags,
} from './features'

describe('DEFAULT_FEATURE_FLAGS', () => {
  it('faces 만 기본 OFF, 나머지는 ON', () => {
    expect(DEFAULT_FEATURE_FLAGS.faces).toBe(false)
    for (const key of FEATURE_FLAGS) {
      if (key !== 'faces') expect(DEFAULT_FEATURE_FLAGS[key]).toBe(true)
    }
  })

  it('모든 플래그 키에 기본값과 라벨이 있다', () => {
    for (const key of FEATURE_FLAGS) {
      expect(DEFAULT_FEATURE_FLAGS[key]).toBeTypeOf('boolean')
      expect(FEATURE_FLAG_LABELS[key].label).toBeTruthy()
      expect(FEATURE_FLAG_LABELS[key].description).toBeTruthy()
    }
  })
})

describe('resolveFeatureFlags', () => {
  it('빈 설정이면 전부 기본값으로 채운다', () => {
    expect(resolveFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('features.<key> 불리언 설정을 반영한다', () => {
    const flags = resolveFeatureFlags({ 'features.likes': false, 'features.faces': true })
    expect(flags.likes).toBe(false)
    expect(flags.faces).toBe(true)
  })

  it('설정에 없는 키는 기본값을 유지한다', () => {
    const flags = resolveFeatureFlags({ 'features.likes': false })
    expect(flags.comments).toBe(true)
    expect(flags.albums).toBe(true)
  })

  it('불리언이 아닌 값은 무시하고 기본값을 쓴다', () => {
    const flags = resolveFeatureFlags({
      'features.likes': 'true',
      'features.comments': 1,
      'features.albums': null,
    })
    expect(flags.likes).toBe(true)
    expect(flags.comments).toBe(true)
    expect(flags.albums).toBe(true)
  })

  it('features. 접두사 없는 키는 무시한다', () => {
    const flags = resolveFeatureFlags({ likes: false, faces: true })
    expect(flags.likes).toBe(true)
    expect(flags.faces).toBe(false)
  })

  it('입력 설정 객체를 변형하지 않는다', () => {
    const input = { 'features.likes': false }
    resolveFeatureFlags(input)
    expect(input).toEqual({ 'features.likes': false })
  })
})
