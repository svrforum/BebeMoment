import { describe, expect, test } from 'vitest'
import { parseDownloadQuality } from './quality'

describe('parseDownloadQuality', () => {
  test('defaults to auto when q is absent', () => {
    expect(parseDownloadQuality(null)).toBe('auto')
  })

  test('keeps the two qualities the app offers', () => {
    expect(parseDownloadQuality('auto')).toBe('auto')
    expect(parseDownloadQuality('original')).toBe('original')
  })

  test('folds the removed compressed qualities into auto — old links still save', () => {
    expect(parseDownloadQuality('hd')).toBe('auto')
    expect(parseDownloadQuality('sd')).toBe('auto')
  })

  test('anything else saves as auto instead of failing the download', () => {
    expect(parseDownloadQuality('4k')).toBe('auto')
    expect(parseDownloadQuality('')).toBe('auto')
  })
})
