import { describe, expect, it } from 'vitest'
import { shareTitle } from './share-title'

// 카탈로그 없이 키·값만 확인하는 최소 번역기.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${Object.values(values).join(',')}` : key

describe('shareTitle', () => {
  it('formats a day share as "<month day> 하루" in the viewer locale', () => {
    expect(shareTitle({ kind: 'date', date: '2026-09-03' }, t, 'ko')).toBe(
      'share.text.date:9월 3일',
    )
    expect(shareTitle({ kind: 'date', date: '2026-09-03' }, t, 'en')).toBe(
      'share.text.date:September 3',
    )
  })

  it('counts a selection and names a single photo', () => {
    expect(shareTitle({ kind: 'selection', assetIds: ['a', 'b', 'c'] }, t, 'ko')).toBe(
      'share.text.selection:3',
    )
    expect(shareTitle({ kind: 'asset', assetId: 'a' }, t, 'ko')).toBe('share.text.asset')
  })

  it('uses the given title for a story or album, falling back to the generic one when empty', () => {
    expect(shareTitle({ kind: 'story', storyId: 's' }, t, 'ko', '첫 미소')).toBe('첫 미소')
    expect(shareTitle({ kind: 'album', albumId: 'a' }, t, 'ko', '')).toBe('share.text.album')
    expect(shareTitle({ kind: 'story', storyId: 's' }, t, 'ko')).toBe('share.text.story')
  })
})
