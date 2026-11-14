import { describe, expect, test } from 'vitest'
import { assetDownloadHref } from '@/lib/asset-download'
import { parseDownloadQuality } from './quality'

function requestedQuality(href: string): string | null {
  return new URL(href, 'http://localhost').searchParams.get('q')
}

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

  // 모르는 q 는 auto 로 접힌다 — 뷰어가 엉뚱한 값을 보내면 에러 없이 EXIF 가 다시 지워진다(#45).
  test('the viewer original link reaches the server as original', () => {
    expect(parseDownloadQuality(requestedQuality(assetDownloadHref('a1', 'original')))).toBe(
      'original',
    )
  })
})
