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

  // 추억 묶음의 메시지 첫 줄은 "사진 3장"이 아니라 그 추억의 이름("1년 전 오늘")이다.
  it('names a memory by its label, falling back to the photo count', () => {
    const target = { kind: 'memory' as const, date: '2025-11-24', assetIds: ['a', 'b', 'c'] }
    expect(shareTitle(target, t, 'ko', '1년 전 오늘 🍼')).toBe('1년 전 오늘 🍼')
    expect(shareTitle(target, t, 'ko', '  ')).toBe('share.text.selection:3')
    expect(shareTitle({ kind: 'selection', assetIds: ['a'] }, t, 'ko', '이름')).toBe(
      'share.text.selection:1',
    )
  })

  it('uses the given title for a story or album, falling back to the generic one when empty', () => {
    expect(shareTitle({ kind: 'story', storyId: 's' }, t, 'ko', '첫 미소')).toBe('첫 미소')
    expect(shareTitle({ kind: 'album', albumId: 'a' }, t, 'ko', '')).toBe('share.text.album')
    expect(shareTitle({ kind: 'story', storyId: 's' }, t, 'ko')).toBe('share.text.story')
  })

  it('uses the schedule title, falling back to the generic one', () => {
    expect(shareTitle({ kind: 'schedule', entryId: 'e' }, t, 'ko', '강남 진료')).toBe('강남 진료')
    expect(shareTitle({ kind: 'schedule', entryId: 'e' }, t, 'ko')).toBe('share.text.schedule')
  })
})
