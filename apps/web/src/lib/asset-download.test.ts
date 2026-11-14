import { describe, expect, test } from 'vitest'
import { assetDownloadHref } from './asset-download'

describe('assetDownloadHref', () => {
  test('saves through the same-origin download route', () => {
    expect(assetDownloadHref('a1', 'auto')).toBe('/api/asset/a1/download?q=auto')
  })

  test('asks for the stored bytes when saving the original', () => {
    expect(assetDownloadHref('a1', 'original')).toBe('/api/asset/a1/download?q=original')
  })
})
